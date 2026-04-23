import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { MODEL_SESSION_CHAT, openaiClient } from "@/lib/openai";
import {
  appendMessage,
  lastAssistantResponseId,
  loadSessionForUser,
} from "@/lib/sessions";
import { supabaseForUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = { content?: unknown };

const encoder = new TextEncoder();

// Streaming user-turn handler. Body: { content: string }. Response:
// text/plain stream — each chunk is the next token the client should
// append. On completion the assistant message is persisted with its
// /v1/responses id; the NEXT turn reads that id as
// previous_response_id from the DB, so the client doesn't need to
// track it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  const authSession = await auth();
  if (!authSession?.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ctx = await supabaseForUser();
  if (!ctx) {
    return NextResponse.json({ error: "no_session_token" }, { status: 401 });
  }

  const raw = (await req.json()) as PostBody;
  const content = typeof raw?.content === "string" ? raw.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }

  const loaded = await loadSessionForUser(sessionId);
  if (!loaded) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (loaded.session.ended_at) {
    return NextResponse.json({ error: "session_ended" }, { status: 409 });
  }

  const previousResponseId = await lastAssistantResponseId(ctx, sessionId);
  if (!previousResponseId) {
    // Session exists but has no assistant opening yet — shouldn't
    // happen in the normal flow (startSession writes the opening
    // inline). Surface as a 500 so Sentry catches it.
    return NextResponse.json(
      { error: "no_previous_response" },
      { status: 500 },
    );
  }

  await appendMessage(ctx, {
    session_id: sessionId,
    is_sent_by_ai: false,
    content,
    ai_response_id: null,
  });

  const openaiStream = await openaiClient().responses.create({
    model: MODEL_SESSION_CHAT,
    previous_response_id: previousResponseId,
    input: [{ role: "user", content }],
    stream: true,
  });

  let accumulated = "";
  let newResponseId: string | null = null;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of openaiStream) {
          if (event.type === "response.output_text.delta") {
            accumulated += event.delta;
            controller.enqueue(encoder.encode(event.delta));
          } else if (event.type === "response.completed") {
            newResponseId = event.response.id;
          }
        }
        if (accumulated && newResponseId) {
          await appendMessage(ctx, {
            session_id: sessionId,
            is_sent_by_ai: true,
            content: accumulated,
            ai_response_id: newResponseId,
          });
        } else {
          console.warn("messages route: stream ended without usable payload", {
            sessionId,
            accumulatedLength: accumulated.length,
            hasResponseId: !!newResponseId,
          });
        }
      } catch (err) {
        console.error("messages route: stream failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        Sentry.captureException(err, {
          tags: { stage: "session_chat_stream", session_id: sessionId },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { captureSessionError } from "@/lib/observability";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_SESSION_CHAT,
  openaiClient,
} from "@/lib/openai";
import {
  appendMessage,
  lastAssistantResponseId,
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

  // Minimal ownership + active-session check. Don't use
  // loadSessionForUser here — that also fetches the full message
  // transcript, which this handler never reads (the client already
  // has it from the server-rendered page).
  const [
    { data: sessionCheck, error: sessionCheckErr },
    previousResponseId,
  ] = await Promise.all([
    ctx.client
      .from("sessions")
      .select("ended_at")
      .eq("id", sessionId)
      .maybeSingle(),
    lastAssistantResponseId(ctx, sessionId),
  ]);
  if (sessionCheckErr) throw sessionCheckErr;
  if (!sessionCheck) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (sessionCheck.ended_at) {
    return NextResponse.json({ error: "session_ended" }, { status: 409 });
  }
  if (!previousResponseId) {
    // Session exists but has no assistant opening yet — shouldn't
    // happen in the normal flow (startSession writes the opening
    // inline). Surface as a 500 so Sentry catches it.
    return NextResponse.json(
      { error: "no_previous_response" },
      { status: 500 },
    );
  }

  // Create the OpenAI stream BEFORE persisting the user turn: if
  // stream creation throws (auth, quota, rate limit), no orphan
  // user turn is left in the transcript. req.signal is piped
  // through so a client disconnect cancels the upstream call.
  const openaiStream = await openaiClient().responses.create(
    {
      model: MODEL_SESSION_CHAT,
      previous_response_id: previousResponseId,
      input: [{ role: "user", content }],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
    },
    { signal: req.signal },
  );

  await appendMessage(ctx, {
    session_id: sessionId,
    is_sent_by_ai: false,
    content,
    ai_response_id: null,
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
        if (newResponseId) {
          // Persist on responseId alone — empty `accumulated` with a
          // completed response (e.g., content-filter refusal) still
          // needs a row so the transcript and previous_response_id
          // chain stay consistent. Anomaly-log the empty-content case
          // so it's visible in Sentry.
          if (!accumulated) {
            captureSessionError(
              new Error("response.completed with empty accumulated text"),
              "session_chat_empty_response",
              sessionId,
            );
          }
          await appendMessage(ctx, {
            session_id: sessionId,
            is_sent_by_ai: true,
            content: accumulated,
            ai_response_id: newResponseId,
          });
        } else {
          captureSessionError(
            new Error("stream ended without response.completed event"),
            "session_chat_no_response_id",
            sessionId,
          );
        }
      } catch (err) {
        // Client disconnects abort the upstream request and throw an
        // AbortError here. That's the intended happy path for cancel,
        // not an error — don't Sentry-capture it.
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.name === "APIUserAbortError");
        if (!isAbort) {
          console.error("messages route: stream failed", {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
          captureSessionError(err, "session_chat_stream", sessionId);
        }
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

"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { buildSessionStartInput } from "@/lib/coaching-prompt";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_SESSION_START,
  openaiClient,
} from "@/lib/openai";
import {
  appendMessage,
  createSessionRow,
  endSession as endSessionWrite,
  ensureCoachingState,
} from "@/lib/sessions";
import { supabaseForUser } from "@/lib/supabase";

async function readUserName(): Promise<string> {
  const ctx = await supabaseForUser();
  if (!ctx) return "friend";
  const { data, error } = await ctx.client
    .from("users")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name?.trim() || "friend";
}

// Creates a new coaching session and the coach's opening message,
// then redirects to the chat page. Called from the "Start session"
// button on /home as a <form action={startSession}>.
//
// The OpenAI call is non-streaming — the opening response is short
// enough that waiting ~2–5s with a form-pending state is fine UX.
// Subsequent user turns stream (see /api/sessions/[id]/messages).
export async function startSession(): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const userName = await readUserName();
  await ensureCoachingState(ctx);

  const input = await buildSessionStartInput({ userName });
  const sessionRow = await createSessionRow(ctx);

  let openingText: string;
  let responseId: string;
  try {
    const response = await openaiClient().responses.create({
      model: MODEL_SESSION_START,
      input,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    openingText = response.output_text;
    responseId = response.id;
  } catch (err) {
    console.error("startSession: OpenAI call failed", {
      sessionId: sessionRow.id,
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err, {
      tags: { stage: "session_start_openai", session_id: sessionRow.id },
    });
    throw err;
  }

  await appendMessage(ctx, {
    session_id: sessionRow.id,
    is_sent_by_ai: true,
    content: openingText,
    ai_response_id: responseId,
  });

  redirect(`/sessions/${sessionRow.id}`);
}

// Ends a session: flips ended_at + is_substantive. Called by the
// "End" button in the chat UI. Chunk 6.3 wraps the session-end
// analysis around this; for 6.2 the session just closes and the
// user lands back on /home.
export async function endSession(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  await endSessionWrite(ctx, sessionId);
  redirect("/home");
}

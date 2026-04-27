"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { buildSessionStartInput } from "@/lib/coaching-prompt";
import { captureSessionError } from "@/lib/observability";
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
import { runSessionEndAnalysis } from "@/lib/session-end";
import { supabaseForUser, type UserSupabase } from "@/lib/supabase";

import { POST_SESSION_RESPONSE_FIELD } from "./[id]/complete/fields";

// Soft cap on the reflection length to bound bad-actor / paste-job
// inputs before they reach the DB. The schema column is unbounded
// `text`; this is a defensive guardrail at the action boundary, not
// a UX limit (the textarea has no maxLength). Anything above gets
// truncated server-side.
const MAX_RESPONSE_LENGTH = 5000;

// Resolve the user's first name for the coaching prompt's
// `Client: <user_name>` field. Three-tier fallback:
//   1. users.display_name — populated by the Clerk webhook on
//      Production. Preferred because the webhook is the canonical
//      lifecycle source.
//   2. Clerk's live user object (currentUser()) — firstName. Covers
//      Preview deploys where the Clerk webhook isn't wired and the
//      users row was self-healed with no display_name set.
//   3. "friend" — last-resort generic address, so the prompt never
//      renders `Client: null` or an empty string.
async function readUserName(ctx: UserSupabase): Promise<string> {
  const { data, error } = await ctx.client
    .from("users")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw error;
  const fromDb = data?.display_name?.trim();
  if (fromDb) return fromDb;

  const clerkUser = await currentUser();
  const fromClerk = clerkUser?.firstName?.trim();
  if (fromClerk) return fromClerk;

  return "friend";
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

  const [userName] = await Promise.all([
    readUserName(ctx),
    ensureCoachingState(ctx),
  ]);

  const input = await buildSessionStartInput({ userName });

  // Call OpenAI BEFORE inserting any rows. If the call fails (network,
  // auth, quota, missing env), we leave no orphan `sessions` row. Once
  // the call succeeds we have the opening text + response_id and both
  // inserts are cheap / effectively infallible.
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
      error: err instanceof Error ? err.message : String(err),
    });
    captureSessionError(err, "session_start_openai");
    throw err;
  }

  const sessionRow = await createSessionRow(ctx);
  await appendMessage(ctx, {
    session_id: sessionRow.id,
    is_sent_by_ai: true,
    content: openingText,
    ai_response_id: responseId,
  });

  redirect(`/sessions/${sessionRow.id}`);
}

// Ends a session. For substantive sessions (≥ SUBSTANTIVE_MESSAGE_
// THRESHOLD messages), the gpt-5 analysis + multi-table write is
// kicked off via Next.js `after()` so the user sees an instant
// redirect while the analysis runs in the background. Short sessions
// skip analysis entirely and go straight to /home.
//
// Idempotency: the DB end-write uses `WHERE ended_at IS NULL` and
// the analysis RPC has its own `WHERE summary IS NULL` guard, so a
// second invocation (user double-click, abandonment cron racing the
// End click) is a safe no-op.
export async function endSession(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const sessionRow = await endSessionWrite(ctx, sessionId);

  if (sessionRow.is_substantive) {
    after(async () => {
      try {
        await runSessionEndAnalysis(ctx, sessionId);
      } catch {
        // runSessionEndAnalysis already logs + captures to Sentry.
        // Swallow here so the background task doesn't crash the
        // serverless invocation after the response has been sent.
      }
    });
    redirect(`/sessions/${sessionId}/complete`);
  }

  redirect("/home");
}

// Writes the post-session reflection (free-text response to the
// coach narrative). Empty submits skip the write and just bounce
// home — same UX as the Skip link.
//
// On a non-empty write we set both `user_response_text` and
// `user_responded_at`, which: (1) flips the page render branch so
// follow-up visits redirect home; (2) primes the row for Call 2
// (response-parser) to pick up later.
export async function submitSessionResponse(
  sessionId: string,
  formData: FormData,
): Promise<void> {
  const authSession = await auth();
  if (!authSession?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const raw = formData.get(POST_SESSION_RESPONSE_FIELD);
  const text =
    typeof raw === "string"
      ? raw.trim().slice(0, MAX_RESPONSE_LENGTH)
      : "";
  if (text.length === 0) redirect("/home");

  const { error } = await ctx.client
    .from("sessions")
    .update({
      user_response_text: text,
      user_responded_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    // Belt-and-suspenders: RLS on `sessions` already scopes UPDATE to
    // the caller's rows, but spelling out user_id makes the scope
    // obvious in code review and survives a hypothetical RLS regression.
    .eq("user_id", ctx.userId)
    .is("user_responded_at", null);
  if (error) {
    captureSessionError(error, "session_response_save", sessionId);
    throw error;
  }
  redirect("/home");
}

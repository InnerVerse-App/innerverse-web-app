"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { buildSessionStartInput } from "@/lib/coaching-prompt";
import {
  clearFlagsOnEntries,
  getEntriesByIds,
} from "@/lib/journal";
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
import { runSessionResponseAnalysis } from "@/lib/session-response";
import { runStyleCalibrationUpdate } from "@/lib/style-calibration";
import { supabaseForUser, type UserSupabase } from "@/lib/supabase";

import {
  ALIGNED_RATING_FIELD,
  HELPFUL_RATING_FIELD,
  POST_SESSION_RESPONSE_FIELD,
  SESSION_REFLECTION_FIELD,
  TONE_RATING_FIELD,
} from "./[id]/complete/fields";

// Soft cap on the reflection length to bound bad-actor / paste-job
// inputs before they reach the DB. The schema column is unbounded
// `text`; this is a defensive guardrail at the action boundary, not
// a UX limit (the textarea has no maxLength). Anything above gets
// truncated server-side.
const MAX_RESPONSE_LENGTH = 5000;
// Same guardrail for the private session reflection. Smaller cap —
// the field is a short personal note, not an essay.
const MAX_SESSION_REFLECTION_LENGTH = 2000;

// Parses a slider FormData entry into a 1-5 int or null. Untouched
// sliders submit no entry at all (the form omits the name until
// interaction), which we persist as NULL so the aggregator reads it
// as "no signal" rather than a misleading neutral 3.
function parseRating(formData: FormData, field: string): number | null {
  const raw = formData.get(field);
  if (typeof raw !== "string") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

// Fire-and-forget POST to the growth-narrative endpoint. Decouples
// the narrative call from the analyzer's after() budget so each
// gets its own 60s function-time ceiling on Vercel Hobby. Failures
// are non-fatal — the narrative endpoint logs to Sentry and the
// last-good narrative on coaching_state stays visible.
function triggerGrowthNarrative(sessionId: string): void {
  const base =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!base || !process.env.CRON_SECRET) {
    // No base URL or no shared secret available → can't trigger.
    // Backfill / cron pickup are the recovery path.
    return;
  }
  const url = `${base}/api/sessions/${sessionId}/generate-narrative`;
  // Don't await — let the trigger complete asynchronously alongside
  // the after() handler returning.
  fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {
    // Network / DNS failure is logged inside the endpoint when it
    // does receive a request; nothing actionable here.
  });
}

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

// Returns the user's session count BEFORE the new row is created.
// Used by startSession to gate the first-session-only coach welcome
// message. RLS scopes the query to the calling user, so no
// `eq("user_id", ...)` filter is needed.
async function countPriorSessions(ctx: UserSupabase): Promise<number> {
  const { count, error } = await ctx.client
    .from("sessions")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

// Creates a new coaching session and the coach's opening message,
// then redirects to the chat page. Called from the "Start session"
// button on /home as a <form action={startSession}>.
//
// The OpenAI call is non-streaming — the opening response is short
// enough that waiting ~2–5s with a form-pending state is fine UX.
// Subsequent user turns stream (see /api/sessions/[id]/messages).
//
// Optional formData fields:
//   focus_kind: "goal" — what the user wants to focus on (only "goal"
//               is currently accepted; "shift" was removed when the
//               home menu's Work-on-my-mindset option was dropped)
//   focus_id:   the corresponding goal.id
//   shared_journal_ids: zero or more journal entry IDs the user
//               picked in the StartSessionMenu's journal-share panel.
//               Resolved through getEntriesByIds (RLS-scoped) so a
//               crafted ID can't pull another user's entries into
//               the prompt. Successfully-shared entries have their
//               flagged_for_session flag cleared after the session
//               row is inserted (the flag has done its job — the
//               LLM has read the entry).
// When focus is present and the row belongs to the caller, the focus
// title is injected into the session-start prompt so the coach can
// open with "I see you want to work on <title> today" instead of a
// blank-slate greeting.
export async function startSession(formData?: FormData): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  // Count any prior sessions BEFORE creating the new row. count==0
  // unlocks the curated coach welcome (lib/coach-welcome.ts) on the
  // user's first-ever session. Empty sessions are deleted in the
  // end-session flow, so this count reflects "real sessions" — a
  // user who started + abandoned several before their first real
  // one will still see the welcome on the one that sticks.
  const [userName, , priorSessionCount] = await Promise.all([
    readUserName(ctx),
    ensureCoachingState(ctx),
    countPriorSessions(ctx),
  ]);

  const [focus, sharedJournalEntries] = await Promise.all([
    resolveFocus(ctx, formData),
    resolveSharedJournalEntries(ctx, formData),
  ]);

  const input = await buildSessionStartInput({
    userName,
    focus,
    isFirstSession: priorSessionCount === 0,
    sharedJournalEntries,
  });

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
      // Opener is mechanical (greeting + acknowledge focus + warm
      // open-ended question). Doesn't need deep deliberation. Low
      // effort cuts ~40% off the latency the user feels right
      // after tapping Start.
      reasoning: { effort: "low" },
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

  // Flag-clear runs inside resolveSharedJournalEntries above (the
  // user's act of submitting the share-step IS the signal). Just
  // bust the client router caches so the cleared flags reflect on
  // /home, /goals, /journal, /sessions when the user navigates back
  // from the live chat.
  if (sharedJournalEntries.length > 0) {
    revalidatePath("/home");
    revalidatePath("/goals");
    revalidatePath("/journal");
    revalidatePath("/sessions");
  }

  // focus_mode (text|voice) chosen on the home/goal pickers — append
  // ?mode=voice to the redirect so the session page can initialize
  // ChatView's voiceMode state. Default (text) needs no query param.
  const modeRaw = formData?.get("focus_mode");
  const mode = typeof modeRaw === "string" ? modeRaw : "text";
  const redirectPath =
    mode === "voice"
      ? `/sessions/${sessionRow.id}?mode=voice`
      : `/sessions/${sessionRow.id}`;
  redirect(redirectPath);
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

  // Empty session — already deleted inside endSessionWrite. Nothing
  // to analyze, nothing to summarize. Bounce home.
  if (!sessionRow) {
    redirect("/home");
  }

  if (sessionRow.is_substantive) {
    after(async () => {
      try {
        await runSessionEndAnalysis(ctx, sessionId);
      } catch {
        // runSessionEndAnalysis already logs + captures to Sentry.
        // Swallow here so the background task doesn't crash the
        // serverless invocation after the response has been sent.
        return; // analyzer failed → don't fire narrative
      }
      // Analyzer succeeded — fire the growth narrative pipeline as a
      // separate function invocation so it gets its own 60s budget.
      // Fire-and-forget: failures are captured server-side and the
      // last-good narrative stays on coaching_state.
      triggerGrowthNarrative(sessionId);
    });
    redirect(`/sessions/${sessionId}/complete`);
  }

  redirect("/home");
}

// Renames a session by writing user_title. Pass an empty string to
// clear and revert to the auto-generated title. The DB CHECK rejects
// whitespace-only or >200-char input; we trim + validate here too so
// we can return a clean error to the client.
export type RenameSessionResult =
  | { ok: true }
  | { ok: false; error: string };

const SESSION_TITLE_MAX_CHARS = 200;

export async function renameSession(
  sessionId: string,
  rawTitle: string,
): Promise<RenameSessionResult> {
  const ctx = await supabaseForUser();
  if (!ctx) return { ok: false, error: "Sign in to rename sessions." };

  const trimmed = rawTitle.trim();
  if (trimmed.length > SESSION_TITLE_MAX_CHARS) {
    return {
      ok: false,
      error: `Title must be ${SESSION_TITLE_MAX_CHARS} characters or fewer.`,
    };
  }

  const next = trimmed.length === 0 ? null : trimmed;
  const { error } = await ctx.client
    .from("sessions")
    .update({ user_title: next })
    .eq("id", sessionId);
  if (error) {
    captureSessionError(error, "session_rename", sessionId);
    return { ok: false, error: "Couldn't save the new title. Try again." };
  }

  // /sessions, /home, /progress all surface the title.
  revalidatePath("/sessions");
  revalidatePath("/home");
  revalidatePath("/progress");
  return { ok: true };
}

// Writes the post-session wrap-up form: free-text narrative response
// (feeds Call 2's disagreement parser), 3-slider feedback (aligned/
// helpful/tone — feeds the calibration aggregator), and a private
// session-reflection note (just for the user's own record).
// Totally-empty submits skip the write and bounce home — same UX as
// the Skip link.
//
// `user_responded_at` is set whenever at least one field carried
// signal. That flips the page render branch so follow-up visits
// redirect home, and (when the narrative response was non-empty)
// primes the row for Call 2 to pick up.
export async function submitSessionResponse(
  sessionId: string,
  formData: FormData,
): Promise<void> {
  const authSession = await auth();
  if (!authSession?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const rawResponse = formData.get(POST_SESSION_RESPONSE_FIELD);
  const responseText =
    typeof rawResponse === "string"
      ? rawResponse.trim().slice(0, MAX_RESPONSE_LENGTH)
      : "";

  const rawReflection = formData.get(SESSION_REFLECTION_FIELD);
  const reflectionText =
    typeof rawReflection === "string"
      ? rawReflection.trim().slice(0, MAX_SESSION_REFLECTION_LENGTH)
      : "";

  const aligned = parseRating(formData, ALIGNED_RATING_FIELD);
  const helpful = parseRating(formData, HELPFUL_RATING_FIELD);
  const tone = parseRating(formData, TONE_RATING_FIELD);

  // Skip the entire write if the user submitted a totally empty
  // form (didn't type a response, didn't write a reflection, didn't
  // touch any slider). Same UX as the "That's enough for today" link.
  const anySignal =
    responseText.length > 0 ||
    reflectionText.length > 0 ||
    aligned !== null ||
    helpful !== null ||
    tone !== null;
  if (!anySignal) redirect("/home");

  const { error } = await ctx.client
    .from("sessions")
    .update({
      user_response_text: responseText.length > 0 ? responseText : null,
      session_reflection: reflectionText.length > 0 ? reflectionText : null,
      aligned_rating: aligned,
      helpful_rating: helpful,
      tone_rating: tone,
      user_responded_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .is("user_responded_at", null);
  if (error) {
    captureSessionError(error, "session_response_save", sessionId);
    throw error;
  }

  // Fire Call 2 (response-parser) in the background only when the
  // user actually wrote a narrative response — that's the only field
  // the parser acts on. Slider values + private reflection are
  // captured for the calibration aggregator and for the user's own
  // record; they don't drive the parser.
  if (responseText.length > 0) {
    after(async () => {
      try {
        await runSessionResponseAnalysis(ctx, sessionId);
      } catch {
        // already logged + captured
      }
    });
  }

  // Fire the style-calibration aggregator whenever any slider was
  // touched OR a narrative response was written. Skipped only on
  // totally-empty submits (which we already short-circuited above
  // via the anySignal guard, but the explicit condition here keeps
  // the trigger logic local and reviewable). Failures are non-fatal:
  // existing coaching_state values stay in place if the aggregator
  // refuses or its output fails validation.
  const anySliderTouched =
    aligned !== null || helpful !== null || tone !== null;
  if (anySliderTouched || responseText.length > 0) {
    after(async () => {
      try {
        await runStyleCalibrationUpdate(ctx, sessionId);
      } catch {
        // already logged + captured
      }
    });
  }

  redirect("/home");
}

// Resolve the journal entry IDs the user selected in the share-step
// into full entry rows, scoped by RLS so a crafted ID can't read
// another user's entry. Drops missing rows silently (deleted between
// share-step submit and now, or never owned by the caller). Returns
// [] for any state where the form is missing the field, has no
// values, or no IDs resolve.
//
// Side effect: clears flagged_for_session on every resolved entry —
// the user's act of submitting the share-step IS the signal that
// they wanted to bring this entry forward, regardless of whether
// the OpenAI call later succeeds. This replaces the prior
// post-session flag-clear, which was non-fatal but could fail
// silently and leave entries pre-selected forever (audit F3).
// Pre-resolve cleanup is self-healing: if a previous session's
// post-clear failed and an entry stayed flagged, sharing it again
// here clears it.
async function resolveSharedJournalEntries(
  ctx: UserSupabase,
  formData: FormData | undefined,
) {
  if (!formData) return [];
  const raw = formData.getAll("shared_journal_ids");
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value === "string" && value.length > 0) {
      ids.push(value);
    }
  }
  if (ids.length === 0) return [];
  const entries = await getEntriesByIds(ctx, ids);
  const flaggedIds = entries
    .filter((e) => e.flagged_for_session)
    .map((e) => e.id);
  if (flaggedIds.length > 0) {
    try {
      await clearFlagsOnEntries(ctx, flaggedIds);
    } catch (err) {
      // Best-effort. If this throws (RLS blip, network), the entries
      // stay flagged and will be re-pre-selected next time — the
      // same self-healing path catches them. Never block the session.
      captureSessionError(err, "journal_flag_clear");
    }
  }
  return entries;
}

// Validates the focus form fields against the caller's own rows so a
// crafted focus_id can't pull another user's goal title into the
// prompt. Returns null when no focus is set, malformed, or the row
// isn't visible to this user. Only `kind: "goal"` is accepted today
// — see SessionFocus in lib/coaching-prompt.ts for context.
async function resolveFocus(
  ctx: UserSupabase,
  formData: FormData | undefined,
): Promise<{ kind: "goal"; title: string } | null> {
  if (!formData) return null;
  const kindRaw = formData.get("focus_kind");
  const idRaw = formData.get("focus_id");
  if (typeof kindRaw !== "string" || typeof idRaw !== "string") return null;
  if (kindRaw !== "goal") return null;
  if (idRaw.length === 0) return null;

  const { data, error } = await ctx.client
    .from("goals")
    .select("title")
    .eq("id", idRaw)
    .maybeSingle();
  if (error || !data?.title) return null;
  return { kind: "goal", title: data.title };
}

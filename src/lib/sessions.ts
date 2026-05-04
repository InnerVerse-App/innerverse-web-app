import "server-only";

import { supabaseForUser, type UserSupabase } from "@/lib/supabase";

export type SessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  is_substantive: boolean | null;
  summary: string | null;
};

export type MessageRow = {
  id: string;
  session_id: string;
  is_sent_by_ai: boolean;
  content: string;
  ai_response_id: string | null;
  created_at: string;
};

// Session is "substantive" once the user has actually engaged.
// Threshold: 5 exchanges = 10 messages (user + assistant pairs).
// Applied by the session-end handler in Chunk 6.3; defined here so
// both 6.2 (may read it for UI) and 6.3 agree on the cutoff.
export const SUBSTANTIVE_MESSAGE_THRESHOLD = 10;

// Creates the coaching_state row if the user doesn't have one yet.
// INSERT runs under the user's own RLS token (policy allows own row).
// Called by startSession so coaching_state always exists before the
// session-end handler tries to UPDATE it in 6.3.
export async function ensureCoachingState(ctx: UserSupabase): Promise<void> {
  const { error } = await ctx.client.from("coaching_state").upsert(
    { user_id: ctx.userId },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

// Creates the sessions row. Returns the full row so callers can chain
// an opening-message INSERT referencing session.id.
export async function createSessionRow(
  ctx: UserSupabase,
): Promise<SessionRow> {
  const { data, error } = await ctx.client
    .from("sessions")
    .insert({ user_id: ctx.userId })
    .select("id, user_id, started_at, ended_at, is_substantive, summary")
    .single();
  if (error) throw error;
  return data as SessionRow;
}

export async function appendMessage(
  ctx: UserSupabase,
  row: {
    session_id: string;
    is_sent_by_ai: boolean;
    content: string;
    ai_response_id: string | null;
  },
): Promise<void> {
  const { error } = await ctx.client.from("messages").insert({
    user_id: ctx.userId,
    ...row,
  });
  if (error) throw error;
}

// Loads one session + its messages IF it belongs to the current user
// (RLS handles the ownership check — a foreign session returns null).
export async function loadSessionForUser(
  sessionId: string,
): Promise<{ session: SessionRow; messages: MessageRow[] } | null> {
  const ctx = await supabaseForUser();
  if (!ctx) return null;

  const [sessionRes, messagesRes] = await Promise.all([
    ctx.client
      .from("sessions")
      .select("id, user_id, started_at, ended_at, is_substantive, summary")
      .eq("id", sessionId)
      .maybeSingle(),
    ctx.client
      .from("messages")
      .select("id, session_id, is_sent_by_ai, content, ai_response_id, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error) throw sessionRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (!sessionRes.data) return null;

  return {
    session: sessionRes.data as SessionRow,
    messages: (messagesRes.data ?? []) as MessageRow[],
  };
}

// Finds the most recent assistant message's ai_response_id for a
// session. Used as /v1/responses previous_response_id on the next
// user turn — OpenAI keeps conversation state server-side, so we
// don't resend the full transcript.
export async function lastAssistantResponseId(
  ctx: UserSupabase,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await ctx.client
    .from("messages")
    .select("ai_response_id")
    .eq("session_id", sessionId)
    .eq("is_sent_by_ai", true)
    .not("ai_response_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.ai_response_id ?? null;
}

export async function countMessages(
  ctx: UserSupabase,
  sessionId: string,
): Promise<number> {
  const { count, error } = await ctx.client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw error;
  return count ?? 0;
}

// True when the session has zero messages from the client (only the
// AI's opening, if any). These are sessions the user started and
// abandoned without typing — we delete them on end-or-close so the
// Sessions tab doesn't fill up with empty placeholders.
export async function hasUserMessages(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const { count, error } = await ctx.client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("is_sent_by_ai", false);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Cascade-deletes a session row + its messages. Used for empty
// sessions where the user never typed anything — the row is just
// noise. Other rows that FK to sessions.id (insights, breakthroughs,
// session_themes, etc.) cascade automatically per the schema, but
// none should exist for an empty session anyway.
export async function deleteSession(
  ctx: UserSupabase,
  sessionId: string,
): Promise<void> {
  // Messages first to avoid orphaning if the cascade isn't set on
  // every related table — defensive even though sessions FK rows
  // do cascade per the migrations.
  const msgRes = await ctx.client
    .from("messages")
    .delete()
    .eq("session_id", sessionId);
  if (msgRes.error) throw msgRes.error;
  const sessRes = await ctx.client
    .from("sessions")
    .delete()
    .eq("id", sessionId);
  if (sessRes.error) throw sessRes.error;
}

// Caps the user at one open non-substantive session at a time.
// Tapping Start is an explicit "fresh start" — if the user wanted
// to resume an in-flight conversation, they'd navigate to /sessions
// instead. Any open sub-substantive session for this user gets
// deleted before the new one is created. Substantive open sessions
// (>= SUBSTANTIVE_MESSAGE_THRESHOLD) are NOT touched here — the
// 5min-idle cron sweep closes those, so they don't accumulate.
export async function discardOpenNonSubstantiveSessions(
  ctx: UserSupabase,
): Promise<void> {
  const { data: open, error } = await ctx.client
    .from("sessions")
    .select("id")
    .is("ended_at", null);
  if (error) {
    // Best-effort cleanup; don't block the new-session flow on a
    // scan failure. Worst case: an extra sub-substantive open
    // session lingers until the cron's 24h delete window.
    console.error("discardOpenNonSubstantiveSessions: scan failed", {
      error: error.message,
    });
    return;
  }
  if (!open || open.length === 0) return;

  for (const session of open) {
    const messageCount = await countMessages(ctx, session.id);
    if (messageCount >= SUBSTANTIVE_MESSAGE_THRESHOLD) continue;
    try {
      await deleteSession(ctx, session.id);
    } catch (err) {
      // Same posture: best-effort. Log + move on.
      console.error("discardOpenNonSubstantiveSessions: delete failed", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// End a session. Two outcomes depending on engagement:
//   * Sub-substantive (empty OR < SUBSTANTIVE_MESSAGE_THRESHOLD
//     messages) → DELETE the row + its messages. No analysis is
//     worth running on a transcript this small (the v7 session_end
//     prompt routinely refuses or returns near-empty output for
//     them), so keeping the row would just be a "Brief session"
//     entry the user can do nothing useful with. Returns null.
//   * Substantive (≥ SUBSTANTIVE_MESSAGE_THRESHOLD) → mark ended,
//     is_substantive=true. Returns the row. The caller (session-end
//     analyzer) layers the gpt-5 RPC write on top.
//
// This matches the cron-sweep behavior — the only thing the user
// clicking End buys them over walking away is they don't have to
// wait through the resume window. The substantive vs sub-
// substantive split is identical either way.
//
// Idempotency: callers race in two cases — user double-tap of End,
// the pagehide beacon firing during the End-button submit, the cron
// sweep running while the user is mid-tap. The DELETE is naturally
// idempotent (a missing row is a no-op). The UPDATE is gated on
// ended_at IS NULL so a second close-attempt finds nothing to update.
export async function endSession(
  ctx: UserSupabase,
  sessionId: string,
): Promise<SessionRow | null> {
  const messageCount = await countMessages(ctx, sessionId);
  const isSubstantive = messageCount >= SUBSTANTIVE_MESSAGE_THRESHOLD;
  if (!isSubstantive) {
    console.log("endSession delete (sub-substantive)", {
      sessionId,
      messageCount,
      threshold: SUBSTANTIVE_MESSAGE_THRESHOLD,
    });
    await deleteSession(ctx, sessionId);
    return null;
  }
  console.log("endSession close", {
    sessionId,
    messageCount,
    threshold: SUBSTANTIVE_MESSAGE_THRESHOLD,
    isSubstantive,
  });
  const { data, error } = await ctx.client
    .from("sessions")
    .update({
      ended_at: new Date().toISOString(),
      is_substantive: true,
    })
    .eq("id", sessionId)
    .is("ended_at", null)
    .select("id, user_id, started_at, ended_at, is_substantive, summary")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      `endSession: session ${sessionId} not found or already ended`,
    );
  }
  return data as SessionRow;
}

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

// Closes a session: sets ended_at and is_substantive based on the
// exchange threshold. Returns the final row. Pure flip — no OpenAI
// call, no analysis writes. Chunk 6.3 layers session-end analysis on
// top by calling this after the JSON write.
export async function endSession(
  ctx: UserSupabase,
  sessionId: string,
): Promise<SessionRow> {
  const messageCount = await countMessages(ctx, sessionId);
  const { data, error } = await ctx.client
    .from("sessions")
    .update({
      ended_at: new Date().toISOString(),
      is_substantive: messageCount >= SUBSTANTIVE_MESSAGE_THRESHOLD,
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

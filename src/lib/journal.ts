import "server-only";

import type { UserSupabase } from "@/lib/supabase";

// Mirrors the columns listEntries selects; safe to consume from
// client modules since types are erased at runtime.
export type JournalEntry = {
  id: string;
  title: string | null;
  content: string;
  flagged_for_session: boolean;
  created_at: string;
  updated_at: string;
};

export async function listEntries(
  ctx: UserSupabase,
  opts?: { limit?: number },
): Promise<JournalEntry[]> {
  let query = ctx.client
    .from("journal_entries")
    .select("id, title, content, flagged_for_session, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (opts?.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as JournalEntry[];
}

export async function getEntryById(
  ctx: UserSupabase,
  id: string,
): Promise<JournalEntry | null> {
  const { data, error } = await ctx.client
    .from("journal_entries")
    .select("id, title, content, flagged_for_session, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as JournalEntry | null) ?? null;
}

// Resolve a list of entry IDs into rows, scoped via RLS to the
// caller. Preserves input order so display ordering carries through
// to the prompt. Drops missing rows silently (deleted between
// share-step submit and now, or never owned by the caller).
export async function getEntriesByIds(
  ctx: UserSupabase,
  ids: string[],
): Promise<JournalEntry[]> {
  if (ids.length === 0) return [];
  const { data, error } = await ctx.client
    .from("journal_entries")
    .select("id, title, content, flagged_for_session, created_at, updated_at")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map<string, JournalEntry>(
    (data ?? []).map((row) => [row.id as string, row as JournalEntry]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is JournalEntry => row != null);
}

export async function clearFlagsOnEntries(
  ctx: UserSupabase,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await ctx.client
    .from("journal_entries")
    .update({ flagged_for_session: false })
    .in("id", ids);
  if (error) throw error;
}

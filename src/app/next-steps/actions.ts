"use server";

import { revalidatePath } from "next/cache";

import { supabaseForUser } from "@/lib/supabase";

// Toggle a next_step between 'pending' and 'done'. RLS scopes the
// read + write to the caller (next_steps_select_own +
// next_steps_update_own, the latter landed alongside the status
// column in PR #53). Silently no-ops on unauthenticated or unknown
// id — this is a fire-and-forget action for the checklist UI; any
// failure surfaces as the row reverting on the next revalidate.
export async function toggleNextStep(id: string): Promise<void> {
  const ctx = await supabaseForUser();
  if (!ctx) return;

  const { data, error: readErr } = await ctx.client
    .from("next_steps")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!data) return;

  const next = (data as { status: string }).status === "done"
    ? "pending"
    : "done";

  const { error: writeErr } = await ctx.client
    .from("next_steps")
    .update({ status: next })
    .eq("id", id);
  if (writeErr) throw writeErr;

  revalidatePath("/next-steps");
}

"use server";

import { revalidatePath } from "next/cache";

import { supabaseForUser } from "@/lib/supabase";

// RLS (next_steps_update_own, added alongside the status column in
// PR #53) scopes the write to the caller; a bad id or cross-user
// attempt silently updates zero rows. We take the current status
// from the client rather than re-reading it server-side — saves a
// round trip, and racing toggles self-heal on the next revalidate.
export async function toggleNextStep(
  id: string,
  currentStatus: "pending" | "done",
): Promise<void> {
  const ctx = await supabaseForUser();
  if (!ctx) return;

  const next = currentStatus === "done" ? "pending" : "done";

  const { error } = await ctx.client
    .from("next_steps")
    .update({ status: next })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/next-steps");
}

import "server-only";

import { supabaseForUser } from "@/lib/supabase";

// Returns the timestamp the user tapped "I understand" on /disclaimer,
// or null if they haven't acknowledged yet. A null return when ctx is
// null (no Clerk session) lets callers gate on auth first, then
// disclaimer — same pattern as getOnboardingState.
export async function getDisclaimerAcknowledgedAt(): Promise<string | null> {
  const ctx = await supabaseForUser();
  if (!ctx) return null;
  const { data, error } = await ctx.client
    .from("users")
    .select("disclaimer_acknowledged_at")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) {
    console.error("getDisclaimerAcknowledgedAt: read failed", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
  return (data?.disclaimer_acknowledged_at as string | null | undefined) ?? null;
}

export function isDisclaimerAcknowledged(value: string | null): boolean {
  return value != null;
}

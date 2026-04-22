import "server-only";

import { supabaseAdmin, supabaseForUser } from "@/lib/supabase";

// Postgres SQLSTATE for foreign_key_violation. Hit when the user's
// row in public.users doesn't exist yet (Clerk webhook hasn't fired,
// or Preview env where webhook isn't wired) and we try to insert
// onboarding_selections referencing user_id.
const PG_FK_VIOLATION = "23503";

// The 6 satisfaction-rating categories shown on onboarding step 3.
// Pinned constants — the satisfaction_ratings jsonb column shape must
// match these keys. Adding a category requires a UI change AND
// updating SATISFACTION_KEYS so the server-side validator accepts it.
export const SATISFACTION_KEYS = [
  "work_purpose",
  "relationships",
  "health_energy",
  "confidence_self_worth",
  "clarity_direction",
  "freedom_of_choice",
] as const;

export type SatisfactionKey = (typeof SATISFACTION_KEYS)[number];
export type SatisfactionRatings = Partial<Record<SatisfactionKey, number>>;

export type OnboardingState = {
  user_id: string;
  why_are_you_here: string[];
  top_goals: string[];
  top_goals_input: string | null;
  satisfaction_ratings: SatisfactionRatings | null;
  coach_notes: string | null;
  coaching_style: string | null;
  coach_name: string | null;
  completed_at: string | null;
};

export type OnboardingPatch = Partial<Omit<OnboardingState, "user_id">>;

const ONBOARDING_COLUMNS =
  "user_id, why_are_you_here, top_goals, top_goals_input, satisfaction_ratings, coach_notes, coaching_style, coach_name, completed_at";

// Returns null when the user has no row yet OR when there's no Clerk
// session — callers treat both as "onboarding not yet started."
export async function getOnboardingState(): Promise<OnboardingState | null> {
  const ctx = await supabaseForUser();
  if (!ctx) return null;
  const { data, error } = await ctx.client
    .from("onboarding_selections")
    .select(ONBOARDING_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("getOnboardingState: read failed", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
  return (data as OnboardingState | null) ?? null;
}

// Idempotent self-heal for the case where a Clerk user has no
// public.users row yet — happens in Preview (webhook not wired) and
// occasionally in Production if the Clerk webhook is delayed past
// the user's first onboarding write. Inserts a minimal row via
// service_role; the webhook can fill in email/display_name later.
async function ensureUserRow(userId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("users")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("ensureUserRow: upsert failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

// Incremental upsert so the user can refresh or return mid-flow
// without losing earlier answers. Self-heals a missing public.users
// row on FK violation (see ensureUserRow).
export async function saveOnboardingStep(
  patch: OnboardingPatch,
): Promise<void> {
  const ctx = await supabaseForUser();
  if (!ctx) {
    throw new Error("saveOnboardingStep: no Clerk session");
  }
  const { client, userId } = ctx;
  const row = { user_id: userId, ...patch };

  const first = await client
    .from("onboarding_selections")
    .upsert(row, { onConflict: "user_id" });
  if (!first.error) return;

  if (first.error.code === PG_FK_VIOLATION) {
    await ensureUserRow(userId);
    const retry = await client
      .from("onboarding_selections")
      .upsert(row, { onConflict: "user_id" });
    if (!retry.error) return;
    console.error("saveOnboardingStep: upsert retry failed", {
      userId,
      code: retry.error.code,
      message: retry.error.message,
    });
    throw retry.error;
  }

  console.error("saveOnboardingStep: upsert failed", {
    userId,
    code: first.error.code,
    message: first.error.message,
  });
  throw first.error;
}

export function isOnboardingComplete(state: OnboardingState | null): boolean {
  return state?.completed_at != null;
}

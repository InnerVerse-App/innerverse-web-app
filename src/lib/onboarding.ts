import "server-only";

import { auth } from "@clerk/nextjs/server";
import { supabaseForUser } from "@/lib/supabase";

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
  const supabase = await supabaseForUser();
  if (!supabase) return null;
  const { data, error } = await supabase
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

// Incremental upsert so the user can refresh or return mid-flow
// without losing earlier answers.
export async function saveOnboardingStep(
  patch: OnboardingPatch,
): Promise<void> {
  const session = await auth();
  const userId = session?.userId;
  if (!userId) {
    throw new Error("saveOnboardingStep: no Clerk session");
  }
  const supabase = await supabaseForUser();
  if (!supabase) {
    throw new Error("saveOnboardingStep: no Supabase client");
  }
  const row = { user_id: userId, ...patch };
  const { error } = await supabase
    .from("onboarding_selections")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("saveOnboardingStep: upsert failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

export function isOnboardingComplete(state: OnboardingState | null): boolean {
  return state?.completed_at != null;
}

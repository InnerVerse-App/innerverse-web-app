"use server";

import { revalidatePath } from "next/cache";
import {
  saveOnboardingStep,
  SATISFACTION_KEYS,
  type SatisfactionRatings,
} from "@/lib/onboarding";
import {
  THEMES,
  GOAL_CATEGORIES,
  COACHING_STYLES,
  COACHES,
  COACH_NOTES_MAX,
  TOP_GOALS_INPUT_MAX,
} from "./data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const THEME_VALUES = new Set(THEMES.map((t) => t.value));
const GOAL_VALUES = new Set(
  GOAL_CATEGORIES.flatMap((c) => c.goals.map((g) => g.value)),
);
const STYLE_VALUES = new Set(COACHING_STYLES.map((s) => s.value));
const COACH_VALUES = new Set(COACHES.map((c) => c.value));

function intersectAllowed(input: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (v): v is string => typeof v === "string" && allowed.has(v),
  );
}

export async function saveStep1(themes: string[]): Promise<ActionResult> {
  const valid = intersectAllowed(themes, THEME_VALUES);
  if (valid.length === 0) {
    return { ok: false, error: "Select at least one theme to continue." };
  }
  await saveOnboardingStep({ why_are_you_here: valid });
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveStep2(
  goals: string[],
  freeText: string,
): Promise<ActionResult> {
  const valid = intersectAllowed(goals, GOAL_VALUES);
  if (valid.length === 0) {
    return { ok: false, error: "Select at least one goal to continue." };
  }
  const trimmed = (freeText ?? "").slice(0, TOP_GOALS_INPUT_MAX);
  await saveOnboardingStep({
    top_goals: valid,
    top_goals_input: trimmed.length > 0 ? trimmed : null,
  });
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveStep3(
  ratings: Record<string, number>,
): Promise<ActionResult> {
  const sanitized: SatisfactionRatings = {};
  for (const key of SATISFACTION_KEYS) {
    const raw = ratings[key];
    const n = typeof raw === "number" ? Math.round(raw) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 5) {
      sanitized[key] = n;
    } else {
      sanitized[key] = 3;
    }
  }
  await saveOnboardingStep({ satisfaction_ratings: sanitized });
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveStep4(notes: string): Promise<ActionResult> {
  const trimmed = (notes ?? "").slice(0, COACH_NOTES_MAX);
  await saveOnboardingStep({ coach_notes: trimmed });
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveStep5(style: string): Promise<ActionResult> {
  if (!STYLE_VALUES.has(style)) {
    return { ok: false, error: "Pick a coaching style to continue." };
  }
  await saveOnboardingStep({ coaching_style: style });
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveStep6(coach: string): Promise<ActionResult> {
  if (!COACH_VALUES.has(coach)) {
    return { ok: false, error: "Pick a coach name to continue." };
  }
  await saveOnboardingStep({
    coach_name: coach,
    completed_at: new Date().toISOString(),
  });
  revalidatePath("/onboarding");
  revalidatePath("/");
  return { ok: true };
}

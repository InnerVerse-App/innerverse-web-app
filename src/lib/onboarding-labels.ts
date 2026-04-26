// Centralized human-readable labels for onboarding-sourced values.
//
// public.onboarding_selections stores the raw `value` strings the
// onboarding UI posts — `build_stronger_relationships`,
// `reduce_stress_anxiety`, `centered`, etc. They must be mapped to
// their `label` from src/app/onboarding/data.ts anywhere they're
// shown to a user, or the UI leaks snake_case internals.
//
// If a stored value is ever not in the mapping (e.g. deleted option
// value, manual admin edit, future data drift), fall back to a
// sentence-case humanized version of the snake_case value so the UI
// renders something readable rather than leaking `foo_bar_baz`.

import {
  COACHES,
  GOAL_CATEGORIES,
  THEMES,
} from "@/app/onboarding/data";

// Exported for callers that need strict lookup (undefined on miss)
// rather than goalLabel's humanized fallback — e.g. server actions
// that must reject unknown values rather than render them.
export const GOAL_LABEL_BY_VALUE = new Map(
  GOAL_CATEGORIES.flatMap((c) => c.goals).map((g) => [g.value, g.label]),
);
const themeByValue = new Map(THEMES.map((t) => [t.value, t.label]));
const coachByValue = new Map(COACHES.map((c) => [c.value, c.label]));

function humanizeSnakeCase(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function goalLabel(value: string): string {
  return GOAL_LABEL_BY_VALUE.get(value) ?? humanizeSnakeCase(value);
}

export function themeLabel(value: string): string {
  return themeByValue.get(value) ?? humanizeSnakeCase(value);
}

export function coachLabel(value: string | null | undefined): string {
  if (!value) return "your coach";
  return coachByValue.get(value) ?? humanizeSnakeCase(value);
}

import "server-only";

import {
  CUSTOM_GOAL_GENERIC_STARTER,
  GOAL_CATEGORIES,
} from "@/app/onboarding/data";
import { goalLabel } from "@/lib/onboarding-labels";
import type { UserSupabase } from "@/lib/supabase";

// Active-goal shape consumed by the session-start prompt assembly,
// the Goals tab UI (G.3), and the Home Top Goal card (G.3 switch).
// Mirrors the columns selected by loadActiveGoalsWithLazySeed.
export type ActiveGoal = {
  id: string;
  title: string;
  description: string | null;
  status: "not_started" | "on_track" | "at_risk";
  progress_percent: number | null;
  progress_rationale: string | null;
  last_session_id: string | null;
  is_predefined: boolean;
};

// Postgres SQLSTATE 23505 = unique_violation. Swallowed when a
// concurrent tab seeds the same predefined goal first.
const PG_UNIQUE_VIOLATION = "23505";

// Soft cap on each goal's description in the prompt rendering.
// Descriptions can be longer in the DB (no schema cap, see PR #70
// audit ledger) — the prompt only shows a truncated form. Keeps
// token budget bounded if a user writes an essay-length description.
const GOAL_DESCRIPTION_PROMPT_MAX = 200;

// Render active goals for the LLM (session-start prompt and the
// session-end transcript prefix). UUIDs round-trip — the session-end
// LLM uses these IDs in updated_goals[].goal_id. Format:
//
//   - [<uuid>] Title (status, NN%) — description (truncated)
//   - [<uuid>] Title (status) — description
//   - [<uuid>] Title (not_started)
//
// progress_percent is omitted when null (status='not_started' before
// the first analyzed session). description is omitted when null/empty.
// Empty array → empty string.
export function formatGoalsForPrompt(goals: ActiveGoal[]): string {
  if (goals.length === 0) return "";
  return goals
    .map((g) => {
      const progress =
        g.progress_percent !== null ? `, ${g.progress_percent}%` : "";
      const head = `[${g.id}] ${g.title} (${g.status}${progress})`;
      const desc = g.description?.trim();
      const descPart = desc
        ? ` — ${desc.slice(0, GOAL_DESCRIPTION_PROMPT_MAX)}${
            desc.length > GOAL_DESCRIPTION_PROMPT_MAX ? "…" : ""
          }`
        : "";
      return `\n\t- ${head}${descPart}`;
    })
    .join("");
}

// Title → starter_action map, built once at module load. Predefined
// goals only; custom goals (created via /goals/new in G.4) get their
// starter from CUSTOM_GOAL_GENERIC_STARTER at create time.
const STARTER_ACTION_BY_TITLE = new Map<string, string>(
  GOAL_CATEGORIES.flatMap((c) => c.goals).map((g) => [g.label, g.starter_action]),
);

export function starterActionForGoalTitle(title: string): string | null {
  return STARTER_ACTION_BY_TITLE.get(title) ?? null;
}

export { CUSTOM_GOAL_GENERIC_STARTER };

// Load the user's active (non-archived) goals, lazy-seeding from
// onboarding_selections.top_goals on first call so a user who finishes
// onboarding and starts coaching before visiting /goals still has goal
// context in their session-start prompt.
//
// Called from three surfaces (all idempotent):
//   - src/lib/coaching-prompt.ts (session-start)
//   - src/app/goals/page.tsx (G.3)
//   - src/app/home/page.tsx (G.3, for the Top Goal card + Goals count)
//
// Race tolerance:
//   - Goals INSERT: a unique-violation 23505 from a concurrent tab is
//     swallowed; the re-fetch picks up whatever the winning tab
//     inserted. The unique partial index (user_id, title) WHERE
//     archived_at IS NULL is the source of truth.
//   - Starter next_steps INSERT: no unique constraint exists on
//     (goal_id, content), so two tabs concurrently observing
//     "no starter for this goal" can both insert, producing duplicate
//     starter rows. Cosmetic, not data-integrity. Acceptable for v1;
//     add a unique constraint if it becomes a real issue.
//
// NULL session_id contract: the next_steps rows inserted here have
// session_id = NULL, which means "system-generated starter, not from
// any session". The next_steps_insert_own RLS policy permits this as
// of PR #71 (G.1.5). User-mode UPDATEs continue to be gated by
// next_steps_update_own (added in PR #53). Future code that writes
// next_steps must NOT bulk-assign session_id to these rows; that
// would break the contract.
export async function loadActiveGoalsWithLazySeed(
  ctx: UserSupabase,
): Promise<ActiveGoal[]> {
  const { client, userId } = ctx;

  const [onboardingRes, existingRes] = await Promise.all([
    client
      .from("onboarding_selections")
      .select("top_goals")
      .maybeSingle(),
    client
      .from("goals")
      .select(
        "id, title, description, status, progress_percent, progress_rationale, last_session_id, is_predefined",
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (onboardingRes.error) throw onboardingRes.error;
  if (existingRes.error) throw existingRes.error;

  const existingActive = (existingRes.data ?? []) as ActiveGoal[];
  const existingTitles = new Set(existingActive.map((g) => g.title));

  const onboardingValues = (onboardingRes.data?.top_goals ?? []) as string[];
  const missing = onboardingValues
    .map((value) => ({ value, title: goalLabel(value) }))
    .filter(({ title }) => !existingTitles.has(title));

  if (missing.length > 0) {
    const insertRows = missing.map(({ title }) => ({
      user_id: userId,
      title,
      is_predefined: true,
    }));
    const { error } = await client.from("goals").insert(insertRows);
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      throw error;
    }
    // Either we inserted, or a concurrent tab beat us. Re-fetch.
  }

  // Re-fetch the canonical active list (covers the just-inserted rows
  // and anything a concurrent tab inserted).
  const finalRes = await client
    .from("goals")
    .select(
      "id, title, description, status, progress_percent, progress_rationale, last_session_id, is_predefined",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (finalRes.error) throw finalRes.error;
  const finalActive = (finalRes.data ?? []) as ActiveGoal[];

  // Backfill starter next_steps for any predefined goal that has zero
  // next_steps tied to it. Custom goals are skipped (their starter is
  // inserted by G.4's createGoal action at create time).
  if (finalActive.length === 0) return finalActive;

  const goalIds = finalActive.map((g) => g.id);
  const stepCountRes = await client
    .from("next_steps")
    .select("goal_id")
    .in("goal_id", goalIds);
  if (stepCountRes.error) throw stepCountRes.error;

  const goalsWithSteps = new Set(
    (stepCountRes.data ?? []).map((r) => r.goal_id as string),
  );

  const startersToInsert = finalActive
    .filter((g) => g.is_predefined && !goalsWithSteps.has(g.id))
    .map((g) => {
      const starter = starterActionForGoalTitle(g.title);
      if (!starter) return null; // Title not in GOAL_CATEGORIES — data drift; skip.
      return {
        user_id: userId,
        goal_id: g.id,
        content: starter,
        status: "pending" as const,
        session_id: null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (startersToInsert.length > 0) {
    const { error } = await client.from("next_steps").insert(startersToInsert);
    if (error) throw error;
  }

  return finalActive;
}

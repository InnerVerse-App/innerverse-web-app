import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  type ActiveGoal,
  formatGoalsForPrompt,
  loadActiveGoalsWithLazySeed,
} from "@/lib/goals";
import { supabaseForUser } from "@/lib/supabase";

// How many of each cross-session signal to pull into the prompt.
// Matches the proposed defaults in the Phase 6 plan; revisit if the
// Bubble app is discovered to use a different N.
const RECENT_BREAKTHROUGHS_N = 5;

// prompt-coaching-chat.md is bundled via next.config.ts
// outputFileTracingIncludes. Read once at module load; the file
// never changes at runtime.
const COACHING_CHAT_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-coaching-chat.md"),
  "utf8",
).trim();

// The two `developer`-role messages that /v1/responses expects on a
// session-start call. Shape mirrors the Bubble API connector exactly
// (reference/screenshots/api-connector/workflow-openai-session-start-*.png).
export type SessionStartInput = [
  { role: "developer"; content: string },
  { role: "developer"; content: string },
];

export type CoachingState = {
  directness: number;
  warmth: number;
  challenge: number;
  recent_style_feedback: string | null;
};

type ProfileSource = {
  user_name: string;
  coaching_style: string;
  ai_persona: string;
  style_calibration: CoachingState;
  recent_breakthroughs: string[];
  last_session_summary: string | null;
  goals: ActiveGoal[];
};

// Render arrays as "\n\t- item1\n\t- item2" to match the example
// values in the Bubble API connector screenshot. Empty array → "".
function bulletList(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `\n\t- ${item}`).join("");
}

function formatClientProfile(src: ProfileSource): string {
  const styleJson = JSON.stringify({
    directness: src.style_calibration.directness,
    warmth: src.style_calibration.warmth,
    challenge: src.style_calibration.challenge,
  });
  return [
    `Client: ${src.user_name}`,
    `Preferred coaching style: ${src.coaching_style}`,
    `Persona: ${src.ai_persona}`,
    `Style calibration (JSON): ${styleJson}`,
    `Recent style feedback: ${src.style_calibration.recent_style_feedback ?? ""}`,
    `Active goals: ${formatGoalsForPrompt(src.goals)}`,
    `Recent breakthroughs/milestones: ${bulletList(src.recent_breakthroughs)}`,
    `Continuity note (last session summary): ${src.last_session_summary ?? ""}`,
  ].join("\n");
}

// Loads every variable the session-start prompt needs for the signed-in
// user and returns the two-message input array ready to hand to
// OpenAI's /v1/responses. Fails loudly if there's no Clerk session or
// if onboarding isn't complete (the /home gate should prevent this but
// defense-in-depth).
export async function buildSessionStartInput(args: {
  userName: string;
}): Promise<SessionStartInput> {
  const ctx = await supabaseForUser();
  if (!ctx) throw new Error("buildSessionStartInput: no Clerk session");

  const { client, userId } = ctx;

  // loadActiveGoalsWithLazySeed runs alongside the other reads. It
  // converts onboarding.top_goals into goals rows on first call (and
  // backfills missing predefined-goal starter next_steps) so a user
  // who hasn't visited /goals yet still sees their goal context in
  // the prompt. Idempotent and safe to call from multiple surfaces.
  const [onboardingRes, stateRes, breakthroughsRes, lastSessionRes, goals] =
    await Promise.all([
      client
        .from("onboarding_selections")
        .select("coaching_style, coach_name, completed_at")
        .maybeSingle(),
      client
        .from("coaching_state")
        .select("directness, warmth, challenge, recent_style_feedback")
        .maybeSingle(),
      client
        .from("breakthroughs")
        .select("content")
        .order("created_at", { ascending: false })
        .limit(RECENT_BREAKTHROUGHS_N),
      client
        .from("sessions")
        .select("summary")
        .not("ended_at", "is", null)
        .not("summary", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadActiveGoalsWithLazySeed(ctx),
    ]);

  if (onboardingRes.error) throw onboardingRes.error;
  if (stateRes.error) throw stateRes.error;
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (lastSessionRes.error) throw lastSessionRes.error;

  const onboarding = onboardingRes.data;
  if (!onboarding?.completed_at) {
    throw new Error(
      "buildSessionStartInput: onboarding not complete for user " + userId,
    );
  }

  const state: CoachingState = stateRes.data ?? {
    directness: 0,
    warmth: 0,
    challenge: 0,
    recent_style_feedback: null,
  };

  const profile = formatClientProfile({
    user_name: args.userName,
    coaching_style: onboarding.coaching_style ?? "",
    ai_persona: onboarding.coach_name ?? "",
    style_calibration: state,
    recent_breakthroughs: (breakthroughsRes.data ?? []).map((r) => r.content),
    last_session_summary: lastSessionRes.data?.summary ?? null,
    goals,
  });

  return [
    { role: "developer", content: COACHING_CHAT_PROMPT },
    { role: "developer", content: profile },
  ];
}

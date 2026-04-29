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

// Two-prompt session model:
//   1. prompt-session-opener-gpt-5-mini.md — rules for the FIRST
//      message only. Carries the focus-aware opening logic
//      ("acknowledge the goal or shift if one was passed; otherwise
//      broad invitation").
//   2. prompt-v11.4-gpt-5.4.md — the master coaching prompt. Governs
//      every turn after the opener. Sent verbatim, never altered.
// Both files are bundled via next.config.ts outputFileTracingIncludes
// (the `prompt-*.md` glob already covers them). Read once at module
// load; files never change at runtime.
//
// On session start we send both as developer messages, plus a third
// developer message with the client profile. The opener rules
// generate turn 1; from turn 2 onward `previous_response_id`
// chaining keeps both prompts in the conversation thread on
// OpenAI's side, so v11.3 governs ongoing coaching while still
// having the opener exchange (the AI's intro + the user's reply)
// in context.
// The `-gpt-X` suffix in each filename names the model the prompt is
// currently running on. When you change the model in src/lib/openai.ts
// you MUST rename the file to match (and update the path here). The
// filename is the at-a-glance source of truth for which prompt is
// running on which model.
const SESSION_OPENER_PROMPT = readFileSync(
  path.join(
    process.cwd(),
    "reference",
    "prompt-session-opener-gpt-5-mini.md",
  ),
  "utf8",
).trim();
const COACHING_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-v11.4-gpt-5.4.md"),
  "utf8",
).trim();

// The `developer`-role messages /v1/responses expects on a
// session-start call. Always present:
//   1. Opener rules (turn 1 only)
//   2. Master coaching prompt (v11.3, ongoing)
//   3. Client profile (name, focus, last session, goals, etc.)
// Optional:
//   4. Style calibration (only when coaching_state.recent_style_
//      feedback is populated — i.e., the aggregator has run at
//      least once for this user). Skipped on early sessions so
//      the coach doesn't see an empty "Style calibration:" block.
export type SessionStartInput = Array<{
  role: "developer";
  content: string;
}>;

export type CoachingState = {
  directness: number;
  warmth: number;
  challenge: number;
  recent_style_feedback: string | null;
};

export type SessionFocus = {
  // "goal" | "shift" — surfaces in the prompt as
  // "Today's focus (goal): ..." / "Today's focus (mindset shift): ..."
  // so the coach can open with the right framing.
  kind: "goal" | "shift";
  title: string;
};

type ProfileSource = {
  user_name: string;
  ai_persona: string;
  style_calibration: CoachingState;
  recent_breakthroughs: string[];
  last_session_summary: string | null;
  goals: ActiveGoal[];
  focus: SessionFocus | null;
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
  const focusLine = src.focus
    ? `Today's focus (${src.focus.kind === "goal" ? "goal" : "mindset shift"}): ${src.focus.title}`
    : "";
  return [
    `Client: ${src.user_name}`,
    `Persona: ${src.ai_persona}`,
    `Style calibration (JSON): ${styleJson}`,
    `Recent style feedback: ${src.style_calibration.recent_style_feedback ?? ""}`,
    `Active goals: ${formatGoalsForPrompt(src.goals)}`,
    `Recent breakthroughs/milestones: ${bulletList(src.recent_breakthroughs)}`,
    `Continuity note (last session summary): ${src.last_session_summary ?? ""}`,
    focusLine,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

// Loads every variable the session-start prompt needs for the signed-in
// user and returns the two-message input array ready to hand to
// OpenAI's /v1/responses. Fails loudly if there's no Clerk session or
// if onboarding isn't complete (the /home gate should prevent this but
// defense-in-depth).
export async function buildSessionStartInput(args: {
  userName: string;
  focus?: SessionFocus | null;
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
        .select("coach_name, completed_at")
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
    ai_persona: onboarding.coach_name ?? "",
    style_calibration: state,
    recent_breakthroughs: (breakthroughsRes.data ?? []).map((r) => r.content),
    last_session_summary: lastSessionRes.data?.summary ?? null,
    goals,
    focus: args.focus ?? null,
  });

  const messages: SessionStartInput = [
    { role: "developer", content: SESSION_OPENER_PROMPT },
    { role: "developer", content: COACHING_PROMPT },
    { role: "developer", content: profile },
  ];

  // Append the style-calibration block as a 4th developer message
  // when it exists. The aggregator (lib/style-calibration.ts) writes
  // recent_style_feedback after each session whose form had any
  // feedback signal; on early sessions before it's run, we omit
  // this entirely so the coach doesn't see an empty header.
  const styleSummary = state.recent_style_feedback?.trim();
  if (styleSummary) {
    messages.push({
      role: "developer",
      content: `Style calibration for this session:\n${styleSummary}`,
    });
  }

  return messages;
}

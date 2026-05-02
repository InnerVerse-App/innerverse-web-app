import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { getCoachWelcome } from "@/lib/coach-welcome";
import {
  type ActiveGoal,
  formatGoalsForPrompt,
  loadActiveGoalsWithLazySeed,
} from "@/lib/goals";
import type { JournalEntry } from "@/lib/journal";
import { supabaseForUser } from "@/lib/supabase";

// How many of each cross-session signal to pull into the prompt.
// Matches the proposed defaults in the Phase 6 plan; revisit if the
// Bubble app is discovered to use a different N.
const RECENT_BREAKTHROUGHS_N = 5;

// Two-prompt session model:
//   1. prompt-session-opener-gpt-5.4-mini.md — rules for the FIRST
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
    "prompt-session-opener-gpt-5.4-mini.md",
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
  // Always "goal" today — the home Start Session menu only offers
  // "work on a goal" or "blank slate", and the per-goal Start button
  // on the Goals tab also passes a goal. Mindset-shift focus was
  // removed when the home menu's "Work on my mindset" option was
  // dropped. Kept as a discriminated field so downstream prompt
  // formatting (`Today's focus (goal): ...`) doesn't have to change
  // shape if a new focus kind is ever introduced.
  kind: "goal";
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
    ? `Today's focus (goal): ${src.focus.title}`
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

// Composes the special turn-1 opener used on a user's first-ever
// session. Constrains the model to deliver the chosen coach's
// welcome message body verbatim while allowing the closing question
// to adapt when the user started the session with a focus. The body
// (~150 words of personality intro + how-this-works) is large
// enough that gpt-5.4-mini at low effort reproduces it
// character-for-character; the exception is the final closing
// sentence/question, which the model is told it MAY rewrite if a
// focus is set.
// Soft cap on total characters of journal content injected into a
// single session prompt. ~20K chars ≈ 5K tokens; combined with the
// existing prompt + transcript it keeps the session-start request
// well under context limits even when a user shares many long
// entries. Older entries are dropped first when the budget overflows
// (each entry's full content is preserved or omitted whole — never
// truncated mid-thought).
const MAX_INJECTED_JOURNAL_CHARS = 20_000;

// Format the entries the user explicitly chose to bring into this
// session. Surfaced as its own developer message (not folded into
// the client profile) so the boundary is clear: these are the user's
// own writing, not derived facts about them. The acknowledgment
// instruction lives in the master coaching prompt; this helper just
// packages the data.
function formatSharedJournalMessage(entries: JournalEntry[]): string {
  const trimmed: JournalEntry[] = [];
  let total = 0;
  for (const entry of entries) {
    const len = entry.content.length;
    if (trimmed.length > 0 && total + len > MAX_INJECTED_JOURNAL_CHARS) break;
    trimmed.push(entry);
    total += len;
  }
  const blocks = trimmed.map((entry, i) => {
    const ts = new Date(entry.created_at);
    const stamp = Number.isNaN(ts.getTime())
      ? entry.created_at
      : `${ts.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} at ${ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    const titleLine = entry.title?.trim()
      ? `Title: ${entry.title.trim()}\n`
      : "";
    return `--- Entry ${i + 1} of ${trimmed.length} — ${stamp}\n${titleLine}${entry.content}`;
  });
  return [
    "The user shared the following journal entries with you for this session. These are their own words, written outside of a coaching session — treat them as raw material the user has chosen to bring forward, not as facts about them. Each entry is bounded by --- markers below. Newlines inside an entry are part of the entry's structure.",
    "",
    "Journal entries shared today:",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

function buildWelcomeInjectionOpener(welcomeText: string): string {
  return [
    "For this turn ONLY — the user's first message of their first-ever coaching session — you MUST output the welcome message below.",
    "",
    "The body of the welcome (everything before the final closing question) is to be delivered VERBATIM, character-for-character. Do not paraphrase, summarize, shorten, expand, or otherwise alter the wording. Punctuation, capitalization, em-dashes, and contractions must match exactly.",
    "",
    "The ONLY part that may change is the welcome's final closing line — the last sentence or two, typically a question that invites the user to start (for example: \"So — what's on your mind?\", \"Where would you like to begin?\", \"What would you like to bring in today?\").",
    "",
    "- If the client profile has NO `Today's focus` line (the user is starting blank-slate), keep the closing question exactly as written.",
    "- If the client profile DOES have a `Today's focus (goal): <title>` line, REPLACE the closing question with one or two short sentences in the same coach's voice that acknowledge the focus and invite the user to start there.",
    "",
    "Do not add a preamble, greeting, sign-off, or any commentary. Output ONLY the welcome message itself, with the closing line adapted as described above.",
    "",
    "WELCOME MESSAGE:",
    "",
    welcomeText,
  ].join("\n");
}

// Loads every variable the session-start prompt needs for the signed-in
// user and returns the developer-message input array ready to hand to
// OpenAI's /v1/responses. Fails loudly if there's no Clerk session or
// if onboarding isn't complete (the /home gate should prevent this but
// defense-in-depth).
//
// `isFirstSession` switches the opener prompt: on the user's very
// first session, we send a verbatim-welcome injection prompt instead
// of the dynamic opener rules. The welcome text comes from
// reference/coach_welcome_messages.md, looked up by coach_name. If
// the welcome lookup fails (unknown coach value, missing file,
// etc.), we fall back to the normal opener so first sessions still
// work — they just won't carry the curated welcome.
//
// `sharedJournalEntries` are entries the user explicitly chose to
// bring into this session via the StartSessionMenu's journal-share
// panel. They get appended as a separate developer message — see
// formatSharedJournalMessage. Empty array (or undefined) means the
// user skipped the share-step; the journal isn't mentioned in the
// prompt at all in that case.
export async function buildSessionStartInput(args: {
  userName: string;
  focus?: SessionFocus | null;
  isFirstSession?: boolean;
  sharedJournalEntries?: JournalEntry[];
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

  const welcomeText = args.isFirstSession
    ? getCoachWelcome(onboarding.coach_name)
    : null;
  const openerPrompt = welcomeText
    ? buildWelcomeInjectionOpener(welcomeText)
    : SESSION_OPENER_PROMPT;

  const messages: SessionStartInput = [
    { role: "developer", content: openerPrompt },
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

  // Append shared journal entries as a separate developer message
  // when the user picked at least one in the share-step. Skipped
  // entirely when they skipped the share-step OR have no journal
  // entries at all — keeps the prompt clean for the common case.
  const sharedEntries = args.sharedJournalEntries ?? [];
  if (sharedEntries.length > 0) {
    messages.push({
      role: "developer",
      content: formatSharedJournalMessage(sharedEntries),
    });
  }

  return messages;
}

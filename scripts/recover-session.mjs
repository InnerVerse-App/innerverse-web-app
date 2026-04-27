// One-off recovery for a stuck session that the in-app /api/sessions/recover
// endpoint can't run because the v7 analysis exceeds Vercel Hobby's 60s
// function cap. Runs the same logic locally with no timeout pressure.
//
// Usage:
//   node scripts/recover-session.mjs <session_id>

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const SESSION_ID = process.argv[2];
if (!SESSION_ID) {
  console.error("usage: node scripts/recover-session.mjs <session_id>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
const openai = new OpenAI({ apiKey: OPENAI_KEY, timeout: 240_000 });

const MODEL = "gpt-5";
const MAX_OUTPUT_TOKENS = 6000;

const COACHES = {
  buddy: { label: "Buddy", description: "Friendly and encouraging, like having a supportive friend" },
  dante: { label: "Dante", description: "Wise and thoughtful, guides you through deep reflections" },
  kelly: { label: "Kelly", description: "Energetic and motivating, helps you take action" },
  maya: { label: "Maya", description: "Calm and centered, helps you find inner peace" },
  orion: { label: "Orion", description: "Adventurous and bold, encourages you to explore new paths" },
  pierre: { label: "Pierre", description: "Sophisticated and insightful, offers elegant solutions" },
  sigmund: { label: "Sigmund", description: "Analytical and deep, helps you understand yourself better" },
};

const PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-session-end-v7.md"),
  "utf8",
).trim();

function daysAgo(iso, now) {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

async function loadSession() {
  const { data, error } = await sb
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, is_substantive")
    .eq("id", SESSION_ID)
    .single();
  if (error) throw error;
  return data;
}

async function loadTranscript() {
  const { data, error } = await sb
    .from("messages")
    .select("is_sent_by_ai, content, created_at")
    .eq("session_id", SESSION_ID)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((m) => `${m.is_sent_by_ai ? "Coach" : "Client"}: ${m.content}`)
    .join("\n\n");
}

async function buildContext(session) {
  const userId = session.user_id;
  const now = Date.now();

  const [userRes, onbRes, goalsRes, themesRes, shiftsRes, brkRes, sessionsRes] = await Promise.all([
    sb.from("users").select("display_name").eq("id", userId).maybeSingle(),
    sb.from("onboarding_selections").select("coach_name").eq("user_id", userId).maybeSingle(),
    sb.from("goals").select("id, title, description, progress_percent, status").eq("user_id", userId).neq("status", "archived"),
    sb.from("themes").select("id, label, description, last_used_at").eq("user_id", userId).order("last_used_at", { ascending: false }).limit(25),
    sb.from("insights").select("id, content, created_at, user_disagreed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    sb.from("breakthroughs").select("id, content, created_at, user_disagreed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    sb.from("sessions").select("id, ended_at").eq("user_id", userId).not("ended_at", "is", null).neq("id", SESSION_ID).order("ended_at", { ascending: false }).limit(30),
  ]);

  const firstName = userRes.data?.display_name?.trim() || "friend";
  const coachKey = onbRes.data?.coach_name ?? null;
  const persona = coachKey && COACHES[coachKey]
    ? COACHES[coachKey]
    : { label: "your coach", description: "warm and grounded, helps you reflect" };

  const goals = goalsRes.data ?? [];
  const themes = themesRes.data ?? [];
  const shifts = shiftsRes.data ?? [];
  const breakthroughs = brkRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  const goalsBlock = goals.length === 0
    ? "(none)"
    : goals.map((g) => {
        const prog = g.progress_percent === null ? "n/a" : `${g.progress_percent}%`;
        const desc = g.description ? `\n  ${g.description}` : "";
        return `- ${g.id} | "${g.title}" | progress: ${prog} | status: ${g.status}${desc}`;
      }).join("\n");

  const themesBlock = themes.length === 0
    ? "(none yet — this user has no theme history)"
    : themes.map((t) => {
        const desc = t.description ? ` — ${t.description}` : "";
        return `- "${t.label}"${desc} (last used ${daysAgo(t.last_used_at, now)})`;
      }).join("\n");

  const shiftsBlock = shifts.length === 0
    ? "(none yet)"
    : shifts.map((s) => `- [${s.id} | ${daysAgo(s.created_at, now)}${s.user_disagreed_at ? " | user_disagreed=true" : ""}] ${s.content}`).join("\n");

  const brkBlock = breakthroughs.length === 0
    ? "(none yet)"
    : breakthroughs.map((b) => `- [${b.id} | ${daysAgo(b.created_at, now)}${b.user_disagreed_at ? " | user_disagreed=true" : ""}] ${b.content}`).join("\n");

  const sessionsBlock = sessions.length === 0
    ? "(none yet)"
    : sessions.map((s) => `- [${s.id} | ${s.ended_at ? daysAgo(s.ended_at, now) : "in progress"}]`).join("\n");

  return [
    `=== Client ===`,
    `First name: ${firstName}`,
    ``,
    `=== Coach Persona ===`,
    `Name: ${persona.label}`,
    `Description: ${persona.description}`,
    ``,
    `=== Active Goals ===`,
    goalsBlock,
    ``,
    `=== Theme Vocabulary (most-recent first) ===`,
    themesBlock,
    ``,
    `=== Recent Mindset Shifts (most-recent first; user_disagreed flag means do NOT cite as a contributor) ===`,
    shiftsBlock,
    ``,
    `=== Recent Breakthroughs (most-recent first; same disagreement rule) ===`,
    brkBlock,
    ``,
    `=== Recent Sessions (most-recent first; eligible pool for contributing_session_ids) ===`,
    sessionsBlock,
  ].join("\n");
}

const INFLUENCE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["target_id", "score"],
    properties: { target_id: { type: "string" }, score: { type: "integer" } },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_summary","progress_summary_short","coach_message","coach_narrative",
    "self_disclosure_score","cognitive_shift_score","emotional_integration_score","novelty_score",
    "score_rationales","progress_percent","session_themes","breakthroughs","mindset_shifts",
    "recommended_next_steps","updated_goals","language_patterns_observed","nervous_system_markers",
    "trauma_protocol_triggered","reflection_mode_recommendation","tone_feedback_recommendation",
    "tool_glossary_suggestions","style_calibration_delta",
  ],
  properties: {
    session_summary: { type: "string" },
    progress_summary_short: { type: "string" },
    coach_message: { type: "string" },
    coach_narrative: { type: "string" },
    self_disclosure_score: { type: "integer" },
    cognitive_shift_score: { type: "integer" },
    emotional_integration_score: { type: "integer" },
    novelty_score: { type: "integer" },
    score_rationales: {
      type: "object",
      additionalProperties: false,
      required: ["self_disclosure","cognitive_shift","emotional_integration","novelty"],
      properties: {
        self_disclosure: { type: "string" },
        cognitive_shift: { type: "string" },
        emotional_integration: { type: "string" },
        novelty: { type: "string" },
      },
    },
    progress_percent: { type: "integer" },
    session_themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label","is_new_theme","description","intensity","score_rationale","direction","evidence_quote","linked_goal_id"],
        properties: {
          label: { type: "string" },
          is_new_theme: { type: "boolean" },
          description: { type: "string" },
          intensity: { type: "integer" },
          score_rationale: { type: "string" },
          direction: { type: "string", enum: ["forward","stuck","regression"] },
          evidence_quote: { type: "string" },
          linked_goal_id: { type: "string" },
        },
      },
    },
    breakthroughs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content","note","linked_theme_label","evidence_quote","combined_score","galaxy_name","direct_session_ids","contributing_shift_ids","contributing_session_ids","influence_scores"],
        properties: {
          content: { type: "string" },
          note: { type: "string" },
          linked_theme_label: { type: "string" },
          evidence_quote: { type: "string" },
          combined_score: { type: "integer" },
          galaxy_name: { type: "string" },
          direct_session_ids: { type: "array", items: { type: "string" } },
          contributing_shift_ids: { type: "array", items: { type: "string" } },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          influence_scores: INFLUENCE_SCHEMA,
        },
      },
    },
    mindset_shifts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content","linked_theme_label","evidence_quote","combined_score","contributing_session_ids","influence_scores"],
        properties: {
          content: { type: "string" },
          linked_theme_label: { type: "string" },
          evidence_quote: { type: "string" },
          combined_score: { type: "integer" },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          influence_scores: INFLUENCE_SCHEMA,
        },
      },
    },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    updated_goals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["goal_id","status","progress_percent","progress_rationale","suggested_next_step","completion_detected","contributing_session_ids","contributing_shift_ids","contributing_breakthrough_ids"],
        properties: {
          goal_id: { type: "string" },
          status: { type: "string", enum: ["not_started","on_track","at_risk"] },
          progress_percent: { type: "integer" },
          progress_rationale: { type: "string" },
          suggested_next_step: { type: "string" },
          completion_detected: { type: "boolean" },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          contributing_shift_ids: { type: "array", items: { type: "string" } },
          contributing_breakthrough_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
    language_patterns_observed: { type: "array", items: { type: "string" } },
    nervous_system_markers: { type: "string" },
    trauma_protocol_triggered: { type: "boolean" },
    reflection_mode_recommendation: { type: "string" },
    tone_feedback_recommendation: { type: "string" },
    tool_glossary_suggestions: { type: "array", items: { type: "string" } },
    style_calibration_delta: {
      type: "object",
      additionalProperties: false,
      required: ["directness","warmth","challenge"],
      properties: {
        directness: { type: "number" },
        warmth: { type: "number" },
        challenge: { type: "number" },
      },
    },
  },
};

async function main() {
  console.log(`recovering session: ${SESSION_ID}`);
  const session = await loadSession();
  console.log(`  user_id: ${session.user_id}`);
  console.log(`  ended_at: ${session.ended_at}`);
  console.log(`  summary: ${session.summary === null ? "(null — needs analysis)" : "(already set — skipping)"}`);
  if (session.summary !== null) {
    console.log("session already has a summary — RPC would short-circuit anyway. exiting.");
    return;
  }

  // Force is_substantive=true if false (the in-app endpoint does the same).
  if (!session.is_substantive) {
    console.log("  flipping is_substantive=true");
    const { error } = await sb.from("sessions").update({ is_substantive: true }).eq("id", SESSION_ID);
    if (error) throw error;
  }

  console.log("loading transcript + context...");
  const [transcript, context] = await Promise.all([loadTranscript(), buildContext(session)]);
  if (!transcript) {
    console.error("empty transcript — nothing to analyze");
    return;
  }
  console.log(`  transcript: ${transcript.length} chars`);
  console.log(`  context: ${context.length} chars`);

  console.log(`calling OpenAI ${MODEL} (this may take 60-180s)...`);
  const t0 = Date.now();
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      { role: "developer", content: PROMPT },
      { role: "developer", content: context },
      { role: "user", content: transcript },
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: "json_schema",
        name: "session_end_analysis",
        schema: SCHEMA,
        strict: true,
      },
    },
  });
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s, status=${response.status}`);

  if (response.status !== "completed") {
    console.error("response not completed:", response.incomplete_details);
    process.exit(1);
  }

  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const c of item.content) {
      if (c.type === "refusal") {
        console.error("model refused:", c.refusal);
        process.exit(1);
      }
    }
  }

  const analysis = JSON.parse(response.output_text);
  console.log(`parsed analysis. summary preview: ${analysis.session_summary.slice(0, 120)}...`);

  console.log("calling process_session_end RPC...");
  const rpcRes = await sb.rpc("process_session_end", {
    p_session_id: SESSION_ID,
    p_analysis: analysis,
  });
  if (rpcRes.error) {
    console.error("RPC failed:", rpcRes.error);
    process.exit(1);
  }
  console.log(`RPC returned: ${rpcRes.data} (true = work done, false = already analyzed)`);
  console.log("DONE. Session summary should now be visible in the app.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

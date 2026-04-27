// Pre-launch fixture runner for V.5a session-end (Call 1) and
// the response-parser (Call 2). Loads a hand-crafted transcript,
// inserts synthetic sessions+messages rows on innerverse-dev under
// FIXTURE_USER_ID, runs the same OpenAI prompts + RPCs production
// uses, then re-queries the resulting DB state and pretty-prints it.
//
// Usage:
//   node --env-file=.env.local scripts/run-fixture.mjs <fixture.json>
//   node --env-file=.env.local scripts/run-fixture.mjs <fixture.json> --response "..."
//
// Run from repo root. Leaves rows in place for inspection — clean
// up later with: delete from sessions where user_id = 'fixture_test_user_v5a';
//
// SCHEMA SYNC: SESSION_END_SCHEMA and SESSION_RESPONSE_SCHEMA below
// must mirror the constants in src/lib/session-end.ts and
// src/lib/session-response.ts respectively. If you bump a prompt or
// add a field in either source, update this script too. Drift will
// surface at runtime as an OpenAI strict-mode rejection.

import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const FIXTURE_USER_ID = "fixture_test_user_v5a";

// ---------------------------------------------------------------
// CLI
// ---------------------------------------------------------------
const args = process.argv.slice(2);
const fixturePath = args[0];
const responseFlag = args.indexOf("--response");
const responseText = responseFlag >= 0 ? args[responseFlag + 1] : null;

if (!fixturePath) {
  console.error(
    "Usage: node --env-file=.env.local scripts/run-fixture.mjs <fixture.json> [--response <text>]",
  );
  process.exit(1);
}

// ---------------------------------------------------------------
// Env + clients
// ---------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
if (!url || !key || !openaiKey) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY",
  );
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const openai = new OpenAI({ apiKey: openaiKey });

// ---------------------------------------------------------------
// Schemas (kept in sync with src/lib/session-end.ts and
// src/lib/session-response.ts — see SCHEMA SYNC note above)
// ---------------------------------------------------------------
const INFLUENCE_SCORES_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["target_id", "score"],
    properties: {
      target_id: { type: "string" },
      score: { type: "integer" },
    },
  },
};

const SESSION_END_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_summary",
    "progress_summary_short",
    "coach_message",
    "coach_narrative",
    "self_disclosure_score",
    "cognitive_shift_score",
    "emotional_integration_score",
    "novelty_score",
    "score_rationales",
    "progress_percent",
    "session_themes",
    "breakthroughs",
    "mindset_shifts",
    "recommended_next_steps",
    "updated_goals",
    "language_patterns_observed",
    "nervous_system_markers",
    "trauma_protocol_triggered",
    "reflection_mode_recommendation",
    "tone_feedback_recommendation",
    "tool_glossary_suggestions",
    "style_calibration_delta",
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
      required: [
        "self_disclosure",
        "cognitive_shift",
        "emotional_integration",
        "novelty",
      ],
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
        required: [
          "label",
          "is_new_theme",
          "description",
          "intensity",
          "score_rationale",
          "direction",
          "evidence_quote",
          "linked_goal_id",
        ],
        properties: {
          label: { type: "string" },
          is_new_theme: { type: "boolean" },
          description: { type: "string" },
          intensity: { type: "integer" },
          score_rationale: { type: "string" },
          direction: { type: "string", enum: ["forward", "stuck", "regression"] },
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
        required: [
          "content",
          "note",
          "linked_theme_label",
          "evidence_quote",
          "combined_score",
          "direct_session_ids",
          "contributing_shift_ids",
          "contributing_session_ids",
          "influence_scores",
        ],
        properties: {
          content: { type: "string" },
          note: { type: "string" },
          linked_theme_label: { type: "string" },
          evidence_quote: { type: "string" },
          combined_score: { type: "integer" },
          direct_session_ids: { type: "array", items: { type: "string" } },
          contributing_shift_ids: { type: "array", items: { type: "string" } },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          influence_scores: INFLUENCE_SCORES_SCHEMA,
        },
      },
    },
    mindset_shifts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "content",
          "linked_theme_label",
          "evidence_quote",
          "combined_score",
          "contributing_session_ids",
          "influence_scores",
        ],
        properties: {
          content: { type: "string" },
          linked_theme_label: { type: "string" },
          evidence_quote: { type: "string" },
          combined_score: { type: "integer" },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          influence_scores: INFLUENCE_SCORES_SCHEMA,
        },
      },
    },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    updated_goals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "goal_id",
          "status",
          "progress_percent",
          "progress_rationale",
          "suggested_next_step",
          "completion_detected",
          "contributing_session_ids",
          "contributing_shift_ids",
          "contributing_breakthrough_ids",
        ],
        properties: {
          goal_id: { type: "string" },
          status: {
            type: "string",
            enum: ["not_started", "on_track", "at_risk"],
          },
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
      required: ["directness", "warmth", "challenge"],
      properties: {
        directness: { type: "number" },
        warmth: { type: "number" },
        challenge: { type: "number" },
      },
    },
  },
};

const DISAGREEMENT_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["id", "note"],
  properties: {
    id: { type: "string" },
    note: { type: "string" },
  },
};

const SESSION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["disagreed_themes", "disagreed_shifts", "disagreed_breakthroughs"],
  properties: {
    disagreed_themes: { type: "array", items: DISAGREEMENT_ITEM },
    disagreed_shifts: { type: "array", items: DISAGREEMENT_ITEM },
    disagreed_breakthroughs: { type: "array", items: DISAGREEMENT_ITEM },
  },
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function trunc(s, n = 120) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function header(title) {
  console.log(`\n=== ${title} ===`);
}

async function ensureUserRow() {
  const { error } = await supabase
    .from("users")
    .upsert(
      { id: FIXTURE_USER_ID },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

// Build a context block matching what buildSessionEndContext emits
// in production. Fixtures may override via fixture.priorContext; the
// default is a "first session, no history" context that exercises
// the bootstrap path.
function buildContextBlock(fixture) {
  if (typeof fixture.priorContext === "string") return fixture.priorContext;
  const persona = fixture.coachPersona ?? {
    name: "your coach",
    description: "warm and grounded, helps you reflect",
  };
  const firstName = fixture.clientFirstName ?? "friend";
  return [
    `=== Client ===`,
    `First name: ${firstName}`,
    ``,
    `=== Coach Persona ===`,
    `Name: ${persona.name}`,
    `Description: ${persona.description}`,
    ``,
    `=== Active Goals ===`,
    `(none)`,
    ``,
    `=== Theme Vocabulary (most-recent first) ===`,
    `(none yet — this user has no theme history)`,
    ``,
    `=== Recent Mindset Shifts (most-recent first; user_disagreed flag means do NOT cite as a contributor) ===`,
    `(none yet)`,
    ``,
    `=== Recent Breakthroughs (most-recent first; same disagreement rule) ===`,
    `(none yet)`,
    ``,
    `=== Recent Sessions (most-recent first; eligible pool for contributing_session_ids) ===`,
    `(none yet)`,
  ].join("\n");
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  console.log(`▶ Fixture: ${fixturePath}`);
  console.log(`  ${fixture.description ?? "(no description)"}`);
  console.log(`  ${fixture.messages.length} messages`);

  await ensureUserRow();

  // Synthesize a 30-minute session ending now.
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 30 * 60 * 1000);
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("sessions")
    .insert({
      user_id: FIXTURE_USER_ID,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      is_substantive: true,
    })
    .select("id")
    .single();
  if (sessionErr) throw sessionErr;
  const sessionId = sessionRow.id;
  console.log(`✓ Created session ${sessionId}`);

  // Insert messages with chronologically-spaced timestamps so the
  // RPC's ordering reads sensibly.
  const baseMs = startedAt.getTime();
  for (let i = 0; i < fixture.messages.length; i++) {
    const m = fixture.messages[i];
    const isAi = m.role === "coach" || m.role === "assistant";
    const createdAt = new Date(baseMs + i * 60_000).toISOString();
    const { error } = await supabase.from("messages").insert({
      user_id: FIXTURE_USER_ID,
      session_id: sessionId,
      is_sent_by_ai: isAi,
      content: m.content,
      created_at: createdAt,
    });
    if (error) throw error;
  }
  console.log(`✓ Inserted ${fixture.messages.length} messages`);

  // ----- Call 1: session-end analysis -----
  const prompt = readFileSync(
    path.join("reference", "prompt-session-end-v7.md"),
    "utf8",
  ).trim();
  const context = buildContextBlock(fixture);
  const transcript = fixture.messages
    .map((m) => {
      const isAi = m.role === "coach" || m.role === "assistant";
      return `${isAi ? "Coach" : "Client"}: ${m.content}`;
    })
    .join("\n\n");

  console.log(`▶ Calling OpenAI session-end (gpt-5)…`);
  const t0 = Date.now();
  const response = await openai.responses.create({
    model: "gpt-5",
    input: [
      { role: "developer", content: prompt },
      { role: "developer", content: context },
      { role: "user", content: transcript },
    ],
    // Bumped above prod's previous 2000 cap — v6 hit it on
    // substantive sessions; v7 hits it more often because every
    // theme + sub-score now carries a rationale. 6000 covers
    // every fixture so far. Bumping is free (OpenAI charges per
    // actual output token, not per cap-ceiling).
    max_output_tokens: 6000,
    text: {
      format: {
        type: "json_schema",
        name: "session_end_analysis",
        schema: SESSION_END_SCHEMA,
        strict: true,
      },
    },
  });
  console.log(`  completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (response.status !== "completed") {
    console.error(`!! status=${response.status}`, response.incomplete_details);
    process.exit(2);
  }
  const analysis = JSON.parse(response.output_text);

  console.log(`▶ Calling process_session_end RPC…`);
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    "process_session_end",
    { p_session_id: sessionId, p_analysis: analysis },
  );
  if (rpcErr) {
    console.error("!! RPC error:", rpcErr);
    process.exit(3);
  }
  console.log(`  RPC returned: ${rpcResult}`);

  // ----- Re-query DB state -----
  const [sRes, themesRes, shiftsRes, btsRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", sessionId).single(),
    supabase
      .from("session_themes")
      .select("*, themes(label)")
      .eq("session_id", sessionId),
    supabase.from("insights").select("*").eq("session_id", sessionId),
    supabase.from("breakthroughs").select("*").eq("session_id", sessionId),
  ]);
  if (sRes.error) throw sRes.error;
  if (themesRes.error) throw themesRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (btsRes.error) throw btsRes.error;

  const s = sRes.data;
  const themes = themesRes.data ?? [];
  const shifts = shiftsRes.data ?? [];
  const breakthroughs = btsRes.data ?? [];

  header("Session row");
  console.log(`  summary:           ${trunc(s.summary)}`);
  console.log(`  progress_summary:  ${trunc(s.progress_summary_short)}`);
  console.log(`  coach_message:     ${trunc(s.coach_message)}`);
  console.log(`  coach_narrative:   ${trunc(s.coach_narrative, 200)}`);
  console.log(
    `  scores:            self_disclosure=${s.self_disclosure_score} cognitive_shift=${s.cognitive_shift_score} emotional_integration=${s.emotional_integration_score} novelty=${s.novelty_score}`,
  );
  console.log(`  progress_percent:  ${s.progress_percent}`);
  console.log(`  trauma_triggered:  ${s.trauma_protocol_triggered}`);

  header(`Themes (${themes.length})`);
  for (const t of themes) {
    console.log(
      `  - "${t.themes?.label ?? "(unknown)"}" | intensity=${t.intensity} | direction=${t.direction}`,
    );
    if (t.evidence_quote) console.log(`      evidence: "${trunc(t.evidence_quote)}"`);
  }

  header(`Mindset shifts (${shifts.length})`);
  for (const sh of shifts) {
    console.log(`  - "${sh.content}"`);
    console.log(`      score: ${sh.combined_score}`);
    if (sh.evidence_quote) console.log(`      evidence: "${trunc(sh.evidence_quote)}"`);
    if (sh.contributing_session_ids?.length)
      console.log(`      contributing_sessions: ${sh.contributing_session_ids.length}`);
  }

  header(`Breakthroughs (${breakthroughs.length})`);
  for (const b of breakthroughs) {
    console.log(`  - "${b.content}"`);
    console.log(`      galaxy: "${b.galaxy_name ?? "(unset)"}"`);
    console.log(`      score: ${b.combined_score}`);
    if (b.evidence_quote) console.log(`      evidence: "${trunc(b.evidence_quote)}"`);
    if (b.contributing_session_ids?.length)
      console.log(`      contributing_sessions: ${b.contributing_session_ids.length}`);
    if (b.contributing_shift_ids?.length)
      console.log(`      contributing_shifts: ${b.contributing_shift_ids.length}`);
    if (b.direct_session_ids?.length)
      console.log(`      direct_sessions: ${b.direct_session_ids.length}`);
  }

  // ----- Optional: Call 2 (response-parser) -----
  if (responseText) {
    header("Call 2 — response parser");
    console.log(`  user response: "${trunc(responseText, 200)}"`);

    const { error: updErr } = await supabase
      .from("sessions")
      .update({
        user_response_text: responseText,
        user_responded_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (updErr) throw updErr;

    const responsePrompt = readFileSync(
      path.join("reference", "prompt-session-response-v2.md"),
      "utf8",
    ).trim();

    const themesList =
      themes.length === 0
        ? "(none recorded for this session)"
        : themes
            .map((t) => {
              const label = t.themes?.label ?? "(unknown)";
              const intensity = t.intensity != null ? ` | intensity ${t.intensity}` : "";
              const rationale = t.score_rationale?.trim()
                ? `\n  rationale: "${t.score_rationale.trim()}"`
                : "";
              return `- ${t.id} — ${label}${intensity}${rationale}`;
            })
            .join("\n");
    const shiftsList =
      shifts.length === 0
        ? "(none — no shifts emitted in this session)"
        : shifts
            .map(
              (sh) =>
                `- ${sh.id} — ${sh.content}${sh.evidence_quote ? `\n  evidence: "${sh.evidence_quote}"` : ""}`,
            )
            .join("\n");
    const btsList =
      breakthroughs.length === 0
        ? "(none — no breakthroughs emitted in this session)"
        : breakthroughs
            .map(
              (b) =>
                `- ${b.id} — ${b.content}${b.evidence_quote ? `\n  evidence: "${b.evidence_quote}"` : ""}`,
            )
            .join("\n");
    const responseContext = [
      `=== Coach narrative shown to client ===`,
      s.coach_narrative ?? "",
      ``,
      `=== Themes recorded in this session ===`,
      themesList,
      ``,
      `=== Mindset shifts emitted in this session ===`,
      shiftsList,
      ``,
      `=== Breakthroughs emitted in this session ===`,
      btsList,
    ].join("\n");

    console.log(`▶ Calling OpenAI session-response (gpt-5)…`);
    const t1 = Date.now();
    const responseRes = await openai.responses.create({
      model: "gpt-5",
      input: [
        { role: "developer", content: responsePrompt },
        { role: "developer", content: responseContext },
        { role: "user", content: responseText },
      ],
      max_output_tokens: 2000,
      text: {
        format: {
          type: "json_schema",
          name: "session_response_analysis",
          schema: SESSION_RESPONSE_SCHEMA,
          strict: true,
        },
      },
    });
    console.log(`  completed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
    if (responseRes.status !== "completed") {
      console.error(`!! Call 2 status=${responseRes.status}`);
      process.exit(4);
    }
    const responseAnalysis = JSON.parse(responseRes.output_text);
    console.log(
      `  emitted: ${responseAnalysis.disagreed_themes.length} theme + ${responseAnalysis.disagreed_shifts.length} shift + ${responseAnalysis.disagreed_breakthroughs.length} breakthrough disagreements`,
    );

    const { data: r2, error: r2Err } = await supabase.rpc(
      "process_session_response",
      { p_session_id: sessionId, p_analysis: responseAnalysis },
    );
    if (r2Err) {
      console.error("!! Call 2 RPC error:", r2Err);
      process.exit(5);
    }
    console.log(`  RPC returned: ${r2}`);

    const [thAfter, shAfter, btAfter] = await Promise.all([
      supabase
        .from("session_themes")
        .select("id, themes(label), user_disagreed_at, user_disagreement_note")
        .eq("session_id", sessionId),
      supabase
        .from("insights")
        .select("id, content, user_disagreed_at, user_disagreement_note")
        .eq("session_id", sessionId),
      supabase
        .from("breakthroughs")
        .select("id, content, user_disagreed_at, user_disagreement_note")
        .eq("session_id", sessionId),
    ]);

    header("Call 2 result — themes");
    for (const t of thAfter.data ?? []) {
      const flag = t.user_disagreed_at ? "DISAGREED" : "agreed";
      console.log(`  ${flag}: "${t.themes?.label ?? "(unknown)"}"`);
      if (t.user_disagreement_note)
        console.log(`      note: "${t.user_disagreement_note}"`);
    }
    header("Call 2 result — shifts");
    for (const sh of shAfter.data ?? []) {
      const flag = sh.user_disagreed_at ? "DISAGREED" : "agreed";
      console.log(`  ${flag}: "${sh.content}"`);
      if (sh.user_disagreement_note)
        console.log(`      note: "${sh.user_disagreement_note}"`);
    }
    header("Call 2 result — breakthroughs");
    for (const b of btAfter.data ?? []) {
      const flag = b.user_disagreed_at ? "DISAGREED" : "agreed";
      console.log(`  ${flag}: "${b.content}"`);
      if (b.user_disagreement_note)
        console.log(`      note: "${b.user_disagreement_note}"`);
    }
  }

  console.log(
    `\n✓ Done. Session ${sessionId} left in place under user '${FIXTURE_USER_ID}'.`,
  );
  console.log(
    `  Inspect via Supabase dashboard or:`,
  );
  console.log(
    `    select * from sessions where id = '${sessionId}';`,
  );
}

main().catch((err) => {
  console.error("\n!! Fatal:", err);
  process.exit(1);
});

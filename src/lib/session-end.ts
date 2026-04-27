import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  captureSessionError,
  type SessionErrorStage,
} from "@/lib/observability";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_SESSION_END,
  openaiClient,
} from "@/lib/openai";
import { buildSessionEndContext } from "@/lib/session-end-context";
import type { UserSupabase } from "@/lib/supabase";

// Bundled at build time via next.config.ts outputFileTracingIncludes.
const SESSION_END_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-session-end-v7.md"),
  "utf8",
).trim();

// Influence scores are emitted as an array of { target_id, score }
// objects rather than an arbitrary-key map. OpenAI strict-mode
// structured outputs require additionalProperties:false on every
// object, which forbids the natural "{ uuid: 0..100 }" map shape.
// The RPC transforms this array into a jsonb object on insert so
// downstream lookups stay cheap.
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
} as const;

// Strict mode forbids numeric bounds (minimum/maximum/minItems); range
// enforcement lives in the prompt and in process_session_end's defensive
// parse (the RPC body under supabase/migrations/).
//
// SCHEMA ↔ DB COUPLING: every top-level field is read by
// public.process_session_end. Some fields (e.g. session_themes,
// breakthroughs, mindset_shifts, updated_goals, style_calibration_delta)
// carry nested object structure — changes to their shape require
// matching updates in both this TS schema AND the RPC's jsonb extraction
// path. Dropping a field is only safe once the RPC stops reading it.
//
// Strict mode treats every property as required, so optional fields
// (evidence_quote, linked_theme_label, etc.) accept empty string when
// not applicable. Contributor / score arrays accept [] / {} when empty.
const SESSION_END_SCHEMA: Record<string, unknown> = {
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
    // V.7: per-sub-score justifications. The prompt requires a
    // 1-sentence rationale citing transcript content for each of
    // the four numeric scores; without rationales the AI is free
    // to slap arbitrary numbers, with them the reasoning is
    // auditable.
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
    // session_themes: the per-session crumb trail. Always non-empty
    // for a substantive session — every session works on something.
    // RPC upserts the theme by (user_id, lower(label)) and writes the
    // session_themes row.
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
          // V.7: per-theme rationale citing transcript content;
          // required for any theme rated 4+. Stored on
          // session_themes.score_rationale.
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
          "galaxy_name",
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
          // V.7.1: short evocative constellation name. Persists to
          // breakthroughs.galaxy_name; the constellation map uses it
          // as the rendered label when present, falling back to the
          // first words of content when missing.
          galaxy_name: { type: "string" },
          direct_session_ids: { type: "array", items: { type: "string" } },
          contributing_shift_ids: { type: "array", items: { type: "string" } },
          contributing_session_ids: { type: "array", items: { type: "string" } },
          // Array shape (not arbitrary-key object) so the schema
          // satisfies OpenAI strict-mode's additionalProperties:false
          // requirement. The RPC transforms it into a jsonb map at
          // insert time for cheap downstream lookups.
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

function failStage(
  stage: SessionErrorStage,
  sessionId: string,
  err: unknown,
  context?: Record<string, unknown>,
): never {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  console.error(`runSessionEndAnalysis: ${stage}`, {
    sessionId,
    error: message,
    ...context,
  });
  captureSessionError(err, stage, sessionId);
  throw err instanceof Error ? err : new Error(message);
}

type TranscriptRow = {
  is_sent_by_ai: boolean;
  content: string;
  created_at: string;
};

// Loads the raw conversation transcript for the session — labeled
// turns only. All structured context (active goals, theme
// vocabulary, persona, recent shifts/breakthroughs) is now passed
// in a separate developer message via buildSessionEndContext, so
// this function stays focused on just the conversation text.
async function loadTranscriptText(
  ctx: UserSupabase,
  sessionId: string,
): Promise<string> {
  const messagesRes = await ctx.client
    .from("messages")
    .select("is_sent_by_ai, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (messagesRes.error) throw messagesRes.error;
  const rows = (messagesRes.data ?? []) as TranscriptRow[];
  return rows
    .map((m) => `${m.is_sent_by_ai ? "Coach" : "Client"}: ${m.content}`)
    .join("\n\n");
}

// Loads the user's coach_name from onboarding_selections so
// buildSessionEndContext can resolve it to a persona description.
// Null when onboarding hasn't completed; the context builder falls
// back to a generic friendly tone in that case.
async function loadCoachName(
  ctx: UserSupabase,
): Promise<string | null> {
  const { data, error } = await ctx.client
    .from("onboarding_selections")
    .select("coach_name")
    .maybeSingle();
  if (error) return null;
  return data?.coach_name ?? null;
}

// Runs the gpt-5 session-end prompt with structured outputs, parses the
// (schema-guaranteed) JSON, and writes the atomic multi-table update via
// the Postgres function. Idempotent via the function's own
// `WHERE summary IS NULL` guard — a second call for the same session is a
// no-op.
export async function runSessionEndAnalysis(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const [transcript, coachName] = await Promise.all([
    loadTranscriptText(ctx, sessionId),
    loadCoachName(ctx),
  ]);
  if (!transcript) {
    // Session had no messages — nothing to analyze. Caller typically
    // filters this out via the substantive threshold, but defense-in-
    // depth: never call OpenAI on an empty transcript.
    return false;
  }

  // V.5a context: theme vocabulary, recent shifts/breakthroughs,
  // active goals, coach persona. Built lazily after the transcript
  // loads so we don't pay the round-trips on the empty-transcript
  // short-circuit.
  const context = await buildSessionEndContext(ctx, coachName, sessionId);

  let response;
  try {
    response = await openaiClient().responses.create({
      model: MODEL_SESSION_END,
      input: [
        { role: "developer", content: SESSION_END_PROMPT },
        { role: "developer", content: context },
        { role: "user", content: transcript },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "session_end_analysis",
          schema: SESSION_END_SCHEMA,
          strict: true,
        },
      },
    });
  } catch (err) {
    failStage("session_end_openai", sessionId, err);
  }

  // Surface truncation as a distinct Sentry stage so the fix-path (raise
  // MAX_OUTPUT_TOKENS) is obvious instead of a generic parse error.
  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    failStage(
      "session_end_truncated",
      sessionId,
      new Error(
        `session-end response not completed: status=${response.status}, reason=${reason}`,
      ),
      { status: response.status, reason },
    );
  }

  // Refusals leave output_text empty without throwing; scan output items
  // to surface them as a distinct stage.
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const c of item.content) {
      if (c.type === "refusal") {
        failStage(
          "session_end_refusal",
          sessionId,
          new Error(`session-end model refused: ${c.refusal}`),
          { refusal: c.refusal },
        );
      }
    }
  }

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(response.output_text) as Record<string, unknown>;
  } catch (err) {
    failStage("session_end_openai", sessionId, err);
  }

  const { data, error } = await ctx.client.rpc("process_session_end", {
    p_session_id: sessionId,
    p_analysis: analysis,
  });
  if (error) {
    failStage("session_end_rpc", sessionId, error, { code: error.code });
  }

  // RPC returns boolean: true if this call did the work, false if a
  // concurrent call already analyzed this session.
  return data === true;
}

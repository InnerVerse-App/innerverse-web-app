import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { formatGoalsForPrompt, loadActiveGoalsWithLazySeed } from "@/lib/goals";
import {
  captureSessionError,
  type SessionErrorStage,
} from "@/lib/observability";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_SESSION_END,
  openaiClient,
} from "@/lib/openai";
import type { UserSupabase } from "@/lib/supabase";

// Bundled at build time via next.config.ts outputFileTracingIncludes.
const SESSION_END_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-session-end-v5.md"),
  "utf8",
).trim();

// Strict mode forbids numeric bounds (minimum/maximum/minItems); range
// enforcement lives in the prompt and in process_session_end's defensive
// parse (the RPC body under supabase/migrations/).
//
// SCHEMA ↔ DB COUPLING: every top-level field is read by
// public.process_session_end. Some fields (e.g. breakthroughs,
// updated_goals, style_calibration_delta) carry nested object
// structure — changes to their shape require matching updates in both
// this TS schema AND the RPC's jsonb extraction path. Dropping a field
// is only safe once the RPC stops reading it.
const SESSION_END_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_summary",
    "progress_summary_short",
    "coach_message",
    "progress_percent",
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
    progress_percent: { type: "integer" },
    breakthroughs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "note"],
        properties: {
          content: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    mindset_shifts: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    // updated_goals: emitted by the LLM for goals it observed in the
    // session. goal_id MUST come from the "Active goals at session
    // start" list prepended to the transcript (see loadTranscriptText).
    // status enum mirrors the goals.status CHECK constraint added in
    // PR #70. progress_percent is required (strict mode) but the LLM
    // emits the prior value when there's no real change. suggested_-
    // next_step is empty string when no specific action applies; the
    // RPC skips the next_steps INSERT in that case.
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

// Build the user-content payload for the session-end LLM. The
// session-end call is a fresh /v1/responses (NOT chained from the
// session conversation), so the LLM doesn't see the session-start
// system prompt. We prepend the active-goals snapshot so the LLM
// can reference goal_ids from `updated_goals[]` reliably — without
// it, the LLM has to invent IDs from the transcript, which it can't
// do faithfully. Plan-level review 2026-04-25, PLAN-FINDING from the
// reviewer.
//
// loadActiveGoalsWithLazySeed is called even though the session-start
// path already invoked it — idempotent ON CONFLICT DO NOTHING is
// cheap, and this keeps the session-end function self-contained for
// the abandonment-cron path (service_role) where the user never
// touched session-start in this process.
async function loadTranscriptText(
  ctx: UserSupabase,
  sessionId: string,
): Promise<string> {
  const [messagesRes, goals] = await Promise.all([
    ctx.client
      .from("messages")
      .select("is_sent_by_ai, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    loadActiveGoalsWithLazySeed(ctx),
  ]);
  if (messagesRes.error) throw messagesRes.error;
  const rows = (messagesRes.data ?? []) as TranscriptRow[];
  const conversation = rows
    .map((m) => `${m.is_sent_by_ai ? "Coach" : "Client"}: ${m.content}`)
    .join("\n\n");

  // Prepend the active-goals snapshot when goals exist. Empty
  // goals: skip the header so the transcript reads cleanly.
  if (goals.length === 0) return conversation;
  const goalsBlock = `Active goals at session start:${formatGoalsForPrompt(goals)}\n\nConversation:\n`;
  return `${goalsBlock}${conversation}`;
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
  const transcript = await loadTranscriptText(ctx, sessionId);
  if (!transcript) {
    // Session had no messages — nothing to analyze. Caller typically
    // filters this out via the substantive threshold, but defense-in-
    // depth: never call OpenAI on an empty transcript.
    return false;
  }

  let response;
  try {
    response = await openaiClient().responses.create({
      model: MODEL_SESSION_END,
      input: [
        { role: "developer", content: SESSION_END_PROMPT },
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

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
import type { UserSupabase } from "@/lib/supabase";

// Bundled at build time via next.config.ts outputFileTracingIncludes.
const SESSION_END_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-session-end-v3.md"),
  "utf8",
).trim();

// Strict mode forbids numeric bounds (minimum/maximum/minItems); range
// enforcement lives in the prompt and in process_session_end's defensive
// parse (migration 20260423120000).
//
// SCHEMA ↔ DB COUPLING: every field is read by public.process_session_end.
// Adding or renaming a field requires a matching RPC migration. Dropping a
// field is only safe once the RPC stops reading it.
const SESSION_END_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_summary",
    "progress_summary_short",
    "progress_percent",
    "breakthroughs",
    "mindset_shifts",
    "recommended_next_steps",
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
    progress_percent: { type: "integer" },
    breakthroughs: { type: "array", items: { type: "string" } },
    mindset_shifts: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
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

async function loadTranscriptText(
  ctx: UserSupabase,
  sessionId: string,
): Promise<string> {
  const { data, error } = await ctx.client
    .from("messages")
    .select("is_sent_by_ai, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as TranscriptRow[];
  return rows
    .map((m) => `${m.is_sent_by_ai ? "Coach" : "Client"}: ${m.content}`)
    .join("\n\n");
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

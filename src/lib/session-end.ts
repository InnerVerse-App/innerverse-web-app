import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { captureSessionError } from "@/lib/observability";
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

// JSON schema for OpenAI structured outputs. Strict-mode constraints:
//   - every property listed in `required`
//   - `additionalProperties: false` on every object (including the nested
//     style_calibration_delta)
//   - no `minimum` / `maximum` / `minItems` / `multipleOf` — those are
//     forbidden under strict: true. Range enforcement lives in the prompt
//     (±0.1 deltas, 0–100 progress_percent) and in the Postgres RPC
//     (see supabase/migrations/20260423120000_process_session_end_defensive_parse.sql
//     which clamps progress_percent and guards array types).
//
// SCHEMA ↔ DB COUPLING: every field here is read by public.process_session_end
// in that migration. Adding or renaming a field here requires a matching
// migration that updates the RPC. Dropping a field here is only safe if the
// RPC stops reading it (the field `updated_goals` was dropped in Phase 6.1
// for exactly this reason — see migration 20260422170000 scope notes).
const SESSION_END_SCHEMA = {
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
} as const;

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

  let analysis: Record<string, unknown>;
  try {
    const response = await openaiClient().responses.create({
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
          schema: SESSION_END_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    });

    // Truncation check. Long transcripts + a 13-field schema can exhaust
    // MAX_OUTPUT_TOKENS. When that happens response.status is "incomplete"
    // and response.output_text is partial JSON — JSON.parse would throw.
    // Detect explicitly so the Sentry signal is "truncated" (fix: raise
    // MAX_OUTPUT_TOKENS) rather than a generic parse error.
    if (response.status !== "completed") {
      const reason = response.incomplete_details?.reason ?? "unknown";
      const err = new Error(
        `session-end response not completed: status=${response.status}, reason=${reason}`,
      );
      console.error("runSessionEndAnalysis: response not completed", {
        sessionId,
        status: response.status,
        reason,
      });
      captureSessionError(err, "session_end_truncated", sessionId);
      throw err;
    }

    // Refusal check. Structured outputs can still refuse via a safety
    // filter. output_text is empty on refusal and doesn't throw — we have
    // to scan the output items explicitly.
    for (const item of response.output) {
      if (item.type !== "message") continue;
      for (const c of item.content) {
        if (c.type === "refusal") {
          const err = new Error(
            `session-end model refused: ${c.refusal}`,
          );
          console.error("runSessionEndAnalysis: model refused", {
            sessionId,
            refusal: c.refusal,
          });
          captureSessionError(err, "session_end_refusal", sessionId);
          throw err;
        }
      }
    }

    analysis = JSON.parse(response.output_text) as Record<string, unknown>;
  } catch (err) {
    // Truncation + refusal already Sentry-captured above with specific
    // stage tags; the throw-through path lands here. Anything else
    // (network, rate limit, actual JSON.parse failure despite structured
    // outputs) gets the generic session_end_openai tag.
    if (
      !(err instanceof Error) ||
      (err.message.indexOf("not completed") === -1 &&
        err.message.indexOf("refused") === -1)
    ) {
      console.error("runSessionEndAnalysis: OpenAI or JSON parse failed", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      captureSessionError(err, "session_end_openai", sessionId);
    }
    throw err;
  }

  const { data, error } = await ctx.client.rpc("process_session_end", {
    p_session_id: sessionId,
    p_analysis: analysis,
  });
  if (error) {
    console.error("runSessionEndAnalysis: RPC failed", {
      sessionId,
      code: error.code,
      message: error.message,
    });
    captureSessionError(error, "session_end_rpc", sessionId);
    throw error;
  }

  // RPC returns boolean: true if this call did the work, false if a
  // concurrent call already analyzed this session.
  return data === true;
}

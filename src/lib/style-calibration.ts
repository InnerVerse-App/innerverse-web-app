import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { captureSessionError } from "@/lib/observability";
import {
  MODEL_STYLE_CALIBRATION,
  openaiClient,
} from "@/lib/openai";
import type { UserSupabase } from "@/lib/supabase";

const CALIBRATION_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-style-calibration-v1.md"),
  "utf8",
).trim();

// How many recent sessions feed the aggregator. Tunable; current
// value of 10 was chosen as a starting point and is flagged in
// Docs/KNOWN_FOLLOW_UPS.md for real-user-testing review.
const RECENT_SESSIONS_N = 10;

// Output cap. The aggregator's prompt asks for ≤300 words plus a
// small JSON shell, so 1500 covers it with comfortable headroom.
const MAX_OUTPUT_TOKENS = 1500;

// Cap on transcript size we feed the aggregator. Past ~150 messages
// the prompt prefix grows faster than the marginal signal — most of
// what shapes the AI's *style* lives in the first 30-40 turns of
// any session anyway.
const MAX_TRANSCRIPT_MESSAGES = 150;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directness", "warmth", "challenge", "summary", "reference_quotes"],
  properties: {
    directness: { type: "number", minimum: -1, maximum: 1 },
    warmth: { type: "number", minimum: -1, maximum: 1 },
    challenge: { type: "number", minimum: -1, maximum: 1 },
    summary: { type: "string" },
    reference_quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text"],
        properties: {
          kind: { type: "string", enum: ["ai_opening", "user_pushback"] },
          text: { type: "string" },
        },
      },
    },
  },
} as const;

type CalibrationOutput = {
  directness: number;
  warmth: number;
  challenge: number;
  summary: string;
  reference_quotes: Array<{ kind: "ai_opening" | "user_pushback"; text: string }>;
};

type SessionFeedbackRow = {
  id: string;
  ended_at: string | null;
  aligned_rating: number | null;
  helpful_rating: number | null;
  tone_rating: number | null;
  user_response_text: string | null;
};

type CoachingStateRow = {
  directness: number;
  warmth: number;
  challenge: number;
  recent_style_feedback: string | null;
};

type MessageRow = {
  is_sent_by_ai: boolean;
  content: string;
  created_at: string;
};

// Builds the structured developer message the aggregator prompt
// expects. Mirrors the four sections described under "What you
// receive" in prompt-style-calibration-v1.md.
function buildContext(args: {
  firstName: string;
  state: CoachingStateRow;
  recent: SessionFeedbackRow[];
  transcript: MessageRow[];
}): string {
  const { firstName, state, recent, transcript } = args;

  const stateBlock = [
    `=== Current coaching state ===`,
    `directness: ${state.directness}`,
    `warmth: ${state.warmth}`,
    `challenge: ${state.challenge}`,
    `recent_style_feedback: ${state.recent_style_feedback?.trim() || "(none yet)"}`,
  ].join("\n");

  const feedbackBlock = [
    `=== Recent feedback (last ${recent.length} session${recent.length === 1 ? "" : "s"}, newest first) ===`,
    recent.length === 0
      ? "(none yet)"
      : recent
          .map((r, idx) => {
            const ratings = [
              r.aligned_rating == null
                ? "aligned=NULL"
                : `aligned=${r.aligned_rating}`,
              r.helpful_rating == null
                ? "helpful=NULL"
                : `helpful=${r.helpful_rating}`,
              r.tone_rating == null ? "tone=NULL" : `tone=${r.tone_rating}`,
            ].join(", ");
            const reply = r.user_response_text?.trim() || "(no narrative reply)";
            return `--- Session #${idx + 1} (${r.ended_at ?? "in progress"}) ---\nratings: ${ratings}\nuser reply: ${reply}`;
          })
          .join("\n\n"),
  ].join("\n");

  const transcriptBlock = [
    `=== Most recent session transcript ===`,
    transcript.length === 0
      ? "(no messages)"
      : transcript
          .map((m) => `${m.is_sent_by_ai ? "Coach" : "Client"}: ${m.content}`)
          .join("\n\n"),
  ].join("\n");

  return [
    `=== Client ===`,
    `First name: ${firstName}`,
    ``,
    stateBlock,
    ``,
    feedbackBlock,
    ``,
    transcriptBlock,
  ].join("\n");
}

function isOutput(value: unknown): value is CalibrationOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.directness !== "number" || v.directness < -1 || v.directness > 1) return false;
  if (typeof v.warmth !== "number" || v.warmth < -1 || v.warmth > 1) return false;
  if (typeof v.challenge !== "number" || v.challenge < -1 || v.challenge > 1) return false;
  if (typeof v.summary !== "string" || v.summary.trim().length === 0) return false;
  if (!Array.isArray(v.reference_quotes)) return false;
  for (const q of v.reference_quotes) {
    if (!q || typeof q !== "object") return false;
    const qq = q as Record<string, unknown>;
    if (qq.kind !== "ai_opening" && qq.kind !== "user_pushback") return false;
    if (typeof qq.text !== "string") return false;
  }
  return true;
}

// Renders the calibration output into the natural-language string
// stored on coaching_state.recent_style_feedback. The next session's
// coaching-prompt loader emits this verbatim as a developer message,
// so the formatting here is what the live coach actually sees.
function renderStyleFeedback(out: CalibrationOutput): string {
  const lines = [out.summary.trim()];
  if (out.reference_quotes.length > 0) {
    lines.push("");
    lines.push("Recent reference points:");
    for (const q of out.reference_quotes) {
      const label = q.kind === "ai_opening" ? "Coach opening" : "Client pushback";
      lines.push(`- ${label}: "${q.text.trim()}"`);
    }
  }
  return lines.join("\n");
}

// Aggregates the user's recent feedback into a fresh calibration
// snapshot and writes it to coaching_state. Idempotent — re-running
// for the same session produces a re-rendered calibration. Failures
// are non-fatal: existing coaching_state values stay in place.
export async function runStyleCalibrationUpdate(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const userId = ctx.userId;

  const [
    userRes,
    stateRes,
    recentRes,
    transcriptRes,
  ] = await Promise.all([
    ctx.client
      .from("users")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
    ctx.client
      .from("coaching_state")
      .select("directness, warmth, challenge, recent_style_feedback")
      .maybeSingle(),
    ctx.client
      .from("sessions")
      .select(
        "id, ended_at, aligned_rating, helpful_rating, tone_rating, user_response_text",
      )
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(RECENT_SESSIONS_N),
    ctx.client
      .from("messages")
      .select("is_sent_by_ai, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(MAX_TRANSCRIPT_MESSAGES),
  ]);
  if (stateRes.error) throw stateRes.error;
  if (recentRes.error) throw recentRes.error;
  if (transcriptRes.error) throw transcriptRes.error;

  const firstName = userRes.data?.display_name?.trim() || "friend";
  const state: CoachingStateRow = stateRes.data ?? {
    directness: 0,
    warmth: 0,
    challenge: 0,
    recent_style_feedback: null,
  };
  const recent = (recentRes.data ?? []) as SessionFeedbackRow[];
  const transcript = (transcriptRes.data ?? []) as MessageRow[];

  // Skip if there's literally no signal to aggregate. Without a
  // prior style summary AND with no slider/reply data, the LLM has
  // nothing to act on.
  const anyFeedbackSignal = recent.some(
    (r) =>
      r.aligned_rating != null ||
      r.helpful_rating != null ||
      r.tone_rating != null ||
      (r.user_response_text != null && r.user_response_text.trim().length > 0),
  );
  if (!anyFeedbackSignal) return false;

  const context = buildContext({ firstName, state, recent, transcript });

  let response;
  try {
    response = await openaiClient().responses.create({
      model: MODEL_STYLE_CALIBRATION,
      input: [
        { role: "developer", content: CALIBRATION_PROMPT },
        { role: "developer", content: context },
        {
          role: "user",
          content:
            "Produce the calibration JSON for this user's next session, following all rules above.",
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "style_calibration",
          schema: SCHEMA,
          strict: true,
        },
      },
      // Calibration is interpretive but bounded — read 10 sessions
      // of feedback + a transcript, output a short JSON object.
      // Low effort matches the growth-narrative call (similar
      // synthesis-from-pre-digested-signals task).
      reasoning: { effort: "low" },
    });
  } catch (err) {
    captureSessionError(err, "style_calibration_openai", sessionId);
    throw err;
  }

  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    const err = new Error(
      `style calibration response not completed: status=${response.status}, reason=${reason}`,
    );
    captureSessionError(err, "style_calibration_truncated", sessionId);
    throw err;
  }

  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const c of item.content) {
      if (c.type === "refusal") {
        const err = new Error(`style calibration model refused: ${c.refusal}`);
        captureSessionError(err, "style_calibration_refusal", sessionId);
        throw err;
      }
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.output_text);
  } catch (err) {
    captureSessionError(err, "style_calibration_openai", sessionId);
    throw err;
  }

  if (!isOutput(parsed)) {
    const err = new Error("style calibration output failed shape validation");
    captureSessionError(err, "style_calibration_shape", sessionId);
    throw err;
  }

  const recentStyleFeedback = renderStyleFeedback(parsed);

  const { error } = await ctx.client
    .from("coaching_state")
    .upsert(
      {
        user_id: userId,
        directness: parsed.directness,
        warmth: parsed.warmth,
        challenge: parsed.challenge,
        recent_style_feedback: recentStyleFeedback,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    captureSessionError(error, "style_calibration_db_write", sessionId);
    throw error;
  }
  return true;
}

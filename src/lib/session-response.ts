import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  captureSessionError,
  type SessionErrorStage,
} from "@/lib/observability";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_SESSION_RESPONSE,
  openaiClient,
} from "@/lib/openai";
import type { UserSupabase } from "@/lib/supabase";

// Bundled at build time via next.config.ts outputFileTracingIncludes
// (the existing prompt-*.md glob covers this filename).
const RESPONSE_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-session-response-v2.md"),
  "utf8",
).trim();

// Strict-mode JSON schema for Call 2's output. Mirrors the structure
// in prompt-session-response-v2.md's "Output" section. All three
// arrays are required (strict mode); empty arrays are valid and
// represent "no disagreements detected" — the common case.
const DISAGREEMENT_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["id", "note"],
  properties: {
    id: { type: "string" },
    note: { type: "string" },
  },
} as const;

const SESSION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["disagreed_themes", "disagreed_shifts", "disagreed_breakthroughs"],
  properties: {
    disagreed_themes: { type: "array", items: DISAGREEMENT_ITEM },
    disagreed_shifts: { type: "array", items: DISAGREEMENT_ITEM },
    disagreed_breakthroughs: { type: "array", items: DISAGREEMENT_ITEM },
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
  console.error(`runSessionResponseAnalysis: ${stage}`, {
    sessionId,
    error: message,
    ...context,
  });
  captureSessionError(err, stage, sessionId);
  throw err instanceof Error ? err : new Error(message);
}

type ShiftRow = {
  id: string;
  content: string;
  evidence_quote: string | null;
};

type BreakthroughRow = {
  id: string;
  content: string;
  evidence_quote: string | null;
};

// V.7: themes are now first-class disagreement targets too. The id
// here is `session_themes.id` (not `themes.id`) — disagreement is
// per-session-instance.
type ThemeRow = {
  id: string;
  intensity: number | null;
  score_rationale: string | null;
  themes: { label: string } | null;
};

type SessionContext = {
  coach_narrative: string | null;
  user_response_text: string | null;
  response_parsed_at: string | null;
};

// Builds the developer-message context for Call 2: the coach
// narrative the client just read, plus every theme / shift /
// breakthrough emitted in this session (ids + content + evidence
// quotes). The AI uses the ids to indicate which prior claims are
// being rejected.
async function buildResponseContext(
  ctx: UserSupabase,
  sessionId: string,
): Promise<{
  session: SessionContext;
  themes: ThemeRow[];
  shifts: ShiftRow[];
  breakthroughs: BreakthroughRow[];
}> {
  const [sessionRes, themesRes, shiftsRes, breakthroughsRes] = await Promise.all([
    ctx.client
      .from("sessions")
      .select("coach_narrative, user_response_text, response_parsed_at")
      .eq("id", sessionId)
      .maybeSingle(),
    ctx.client
      .from("session_themes")
      .select("id, intensity, score_rationale, themes(label)")
      .eq("session_id", sessionId),
    ctx.client
      .from("insights")
      .select("id, content, evidence_quote")
      .eq("session_id", sessionId),
    ctx.client
      .from("breakthroughs")
      .select("id, content, evidence_quote")
      .eq("session_id", sessionId),
  ]);
  if (sessionRes.error) throw sessionRes.error;
  if (themesRes.error) throw themesRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (!sessionRes.data) {
    throw new Error(`session not found: ${sessionId}`);
  }
  return {
    session: sessionRes.data as SessionContext,
    themes: (themesRes.data ?? []) as unknown as ThemeRow[],
    shifts: (shiftsRes.data ?? []) as ShiftRow[],
    breakthroughs: (breakthroughsRes.data ?? []) as BreakthroughRow[],
  };
}

function formatThemes(rows: ThemeRow[]): string {
  if (rows.length === 0) return "(none recorded for this session)";
  return rows
    .map((t) => {
      const label = t.themes?.label ?? "(unknown)";
      const intensity = t.intensity != null ? ` | intensity ${t.intensity}` : "";
      const rationale = t.score_rationale?.trim()
        ? `\n  rationale: "${t.score_rationale.trim()}"`
        : "";
      return `- ${t.id} — ${label}${intensity}${rationale}`;
    })
    .join("\n");
}

function formatShifts(rows: ShiftRow[]): string {
  if (rows.length === 0) return "(none — no shifts emitted in this session)";
  return rows
    .map((s) => {
      const ev = s.evidence_quote?.trim()
        ? `\n  evidence: "${s.evidence_quote.trim()}"`
        : "";
      return `- ${s.id} — ${s.content}${ev}`;
    })
    .join("\n");
}

function formatBreakthroughs(rows: BreakthroughRow[]): string {
  if (rows.length === 0) return "(none — no breakthroughs emitted in this session)";
  return rows
    .map((b) => {
      const ev = b.evidence_quote?.trim()
        ? `\n  evidence: "${b.evidence_quote.trim()}"`
        : "";
      return `- ${b.id} — ${b.content}${ev}`;
    })
    .join("\n");
}

// Runs Call 2 (response-parser): reads the session's prior analysis
// + the user's free-text response, calls OpenAI to identify any
// claims the user rejected, then writes the disagreements via the
// process_session_response RPC.
//
// Idempotent: the RPC's `WHERE response_parsed_at IS NULL` guard
// makes a second invocation a no-op. Returns true if this call did
// the work, false if a concurrent call already parsed the response
// (or if there was no response to parse).
export async function runSessionResponseAnalysis(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const context = await buildResponseContext(ctx, sessionId);

  if (context.session.response_parsed_at) {
    return false;
  }
  if (!context.session.user_response_text?.trim()) {
    return false;
  }
  if (!context.session.coach_narrative?.trim()) {
    // Should not happen — UI never lets the user respond before the
    // narrative renders — but defense-in-depth: don't call the model
    // without the narrative the user was reacting to.
    return false;
  }

  // Skip the call entirely when there's nothing to disagree with.
  // Persist response_parsed_at directly so the row doesn't sit in
  // the unparsed bucket forever. v7 adds themes to the disagreement
  // surface, so the empty-bucket check covers all three.
  if (
    context.themes.length === 0 &&
    context.shifts.length === 0 &&
    context.breakthroughs.length === 0
  ) {
    const { data, error } = await ctx.client.rpc("process_session_response", {
      p_session_id: sessionId,
      p_analysis: {
        disagreed_themes: [],
        disagreed_shifts: [],
        disagreed_breakthroughs: [],
      },
    });
    if (error) {
      failStage("session_response_rpc", sessionId, error, { code: error.code });
    }
    return data === true;
  }

  const developerContext = [
    `=== Coach narrative shown to client ===`,
    context.session.coach_narrative.trim(),
    ``,
    `=== Themes recorded in this session ===`,
    formatThemes(context.themes),
    ``,
    `=== Mindset shifts emitted in this session ===`,
    formatShifts(context.shifts),
    ``,
    `=== Breakthroughs emitted in this session ===`,
    formatBreakthroughs(context.breakthroughs),
  ].join("\n");

  let response;
  try {
    response = await openaiClient().responses.create({
      model: MODEL_SESSION_RESPONSE,
      input: [
        { role: "developer", content: RESPONSE_PROMPT },
        { role: "developer", content: developerContext },
        { role: "user", content: context.session.user_response_text },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "session_response_analysis",
          schema: SESSION_RESPONSE_SCHEMA,
          strict: true,
        },
      },
    });
  } catch (err) {
    failStage("session_response_openai", sessionId, err);
  }

  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    failStage(
      "session_response_truncated",
      sessionId,
      new Error(
        `session-response not completed: status=${response.status}, reason=${reason}`,
      ),
      { status: response.status, reason },
    );
  }

  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const c of item.content) {
      if (c.type === "refusal") {
        failStage(
          "session_response_refusal",
          sessionId,
          new Error(`session-response refused: ${c.refusal}`),
          { refusal: c.refusal },
        );
      }
    }
  }

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(response.output_text) as Record<string, unknown>;
  } catch (err) {
    failStage("session_response_openai", sessionId, err);
  }

  const { data, error } = await ctx.client.rpc("process_session_response", {
    p_session_id: sessionId,
    p_analysis: analysis,
  });
  if (error) {
    failStage("session_response_rpc", sessionId, error, { code: error.code });
  }

  return data === true;
}

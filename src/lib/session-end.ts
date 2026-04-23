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

// The LLM is instructed to emit pure JSON, but models sometimes wrap
// the response in ``` fences anyway. Tolerate both shapes.
function parseAnalysisJson(raw: string): unknown {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(stripped);
}

// Runs the gpt-5 session-end prompt, parses the JSON, and writes the
// atomic multi-table update via the Postgres function. Idempotent
// via the function's own `WHERE summary IS NULL` guard — a second
// call for the same session is a no-op.
export async function runSessionEndAnalysis(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const transcript = await loadTranscriptText(ctx, sessionId);
  if (!transcript) {
    // Session had no messages — nothing to analyze. Caller
    // typically filters this out via the substantive threshold, but
    // defense-in-depth: never call OpenAI on an empty transcript.
    return false;
  }

  let analysis: unknown;
  try {
    const response = await openaiClient().responses.create({
      model: MODEL_SESSION_END,
      input: [
        { role: "developer", content: SESSION_END_PROMPT },
        { role: "user", content: transcript },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    analysis = parseAnalysisJson(response.output_text);
  } catch (err) {
    console.error("runSessionEndAnalysis: OpenAI or JSON parse failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureSessionError(err, "session_end_openai", sessionId);
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

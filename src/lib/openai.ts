import "server-only";

import OpenAI from "openai";

// Model pins (reference/decisions.md § Tech Stack → Model usage).
// Changing these is a deliberate coaching-parity decision, not a free swap.
//
// Migrated 2026-04-28 from gpt-5 / gpt-5.2 (legacy aliases pinned at
// older snapshots) to gpt-5.4-mini across the board. Reasoning per
// OpenAI's published comparisons:
//   * 5.4-mini benchmarks higher than the original gpt-5
//   * Same context window (no regression on long transcripts)
//   * Optimized for retrieval-augmented use cases — needle-in-a-
//     haystack accuracy + noise filtering matter directly for our
//     analyzer (evidence-quote extraction over a long transcript)
//     and for the chat (catching contradictions across a long
//     session via the chained context)
//   * ~75% cheaper end-to-end at our usage profile
// Quality bar to hold against: the live coaching nuance we relied
// on gpt-5 for. If output quality regresses for any specific call
// in production, swap that one back to gpt-5.4 or gpt-5.5.
export const MODEL_SESSION_START = "gpt-5.4-mini";
export const MODEL_SESSION_CHAT = "gpt-5.4-mini";
export const MODEL_SESSION_END = "gpt-5.4-mini";
export const MODEL_SESSION_RESPONSE = "gpt-5.4-mini";
export const MODEL_GROWTH_NARRATIVE = "gpt-5.4-mini";
export const MODEL_STYLE_CALIBRATION = "gpt-5.4-mini";

// Bumped from 2000 (v5) to 4000 (v6) to 6000 (v7) as the prompts
// have grown. v7 adds per-theme rationales + per-sub-score
// rationales, which roughly doubled the typical output size on the
// pre-launch fixtures. 6000 covers every fixture so far. Bumping is
// free: OpenAI charges per actual output token, not per cap-ceiling.
// Session-start / Call 2 use far less anyway.
export const MAX_OUTPUT_TOKENS = 6000;

// OpenAI client timeout. Bumped 60_000 → 180_000 after v7 sessions
// were timing out on substantive transcripts. v7's output is
// materially bigger than v5/v6 (per-theme + per-sub-score rationales,
// galaxy_name, etc.); on rich sessions gpt-5 occasionally runs past
// 60s. 180s gives generous headroom without making genuinely-stuck
// requests sit forever.
const CLIENT_TIMEOUT_MS = 180_000;

let cachedClient: OpenAI | null = null;

export function openaiClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing env: OPENAI_API_KEY");
  }
  cachedClient = new OpenAI({ apiKey, timeout: CLIENT_TIMEOUT_MS });
  return cachedClient;
}

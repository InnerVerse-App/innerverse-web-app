import "server-only";

import OpenAI from "openai";

// Model pins (reference/decisions.md § Tech Stack → Model usage).
// Changing these is a deliberate coaching-parity decision, not a free swap.
export const MODEL_SESSION_START = "gpt-5";
export const MODEL_SESSION_CHAT = "gpt-5.2";
export const MODEL_SESSION_END = "gpt-5";
// Call 2 (response-parser) — same family as session-end. The task is
// narrower so we could downsize, but matching session-end keeps
// reasoning quality consistent for the disagreement-detection rubric.
export const MODEL_SESSION_RESPONSE = "gpt-5";

// Bumped from 2000 (v5) to 4000 (v6) to 6000 (v7) as the prompts
// have grown. v7 adds per-theme rationales + per-sub-score
// rationales, which roughly doubled the typical output size on the
// pre-launch fixtures. 6000 covers every fixture so far. Bumping is
// free: OpenAI charges per actual output token, not per cap-ceiling.
// Session-start / Call 2 use far less anyway.
export const MAX_OUTPUT_TOKENS = 6000;

// OpenAI client timeout. Coaching responses stream for tens of seconds;
// 60s covers the non-streaming session-start call.
const CLIENT_TIMEOUT_MS = 60_000;

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

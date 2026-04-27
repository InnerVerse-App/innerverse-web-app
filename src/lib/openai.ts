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

// Bumped from 2000 after the pre-launch fixture runner caught
// session-end (prompt v6) hitting the cap on substantive sessions
// — the v6 schema (coach_narrative + sub-scores + session_themes +
// multi-field shifts/breakthroughs) is materially larger than v5's
// output. 4000 covers every fixture so far with headroom. Bumping
// the cap is free: OpenAI charges per actual output token, not per
// cap-ceiling, and session-start / Call 2 use far less anyway.
export const MAX_OUTPUT_TOKENS = 4000;

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

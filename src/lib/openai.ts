import "server-only";

import OpenAI from "openai";

// Model pins (reference/decisions.md § Tech Stack → Model usage).
// Changing these is a deliberate coaching-parity decision, not a free swap.
export const MODEL_SESSION_START = "gpt-5";
export const MODEL_SESSION_CHAT = "gpt-5.2";
export const MODEL_SESSION_END = "gpt-5";

// Bubble uses 2000 for session-start; matched here.
export const MAX_OUTPUT_TOKENS = 2000;

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

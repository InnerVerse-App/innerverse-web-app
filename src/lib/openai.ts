import "server-only";

import OpenAI from "openai";

// Model pins (reference/decisions.md § Tech Stack → Model usage).
// Changing these is a deliberate coaching-parity decision, not a free swap.
//
// 2026-04-29 — split assignment. Each call is sized to the task:
//   * Chat (live coaching dialogue) — gpt-5.2. Newest flagship.
//     Coaching nuance is the product; we accept the premium here.
//   * Session-end analyzer — gpt-5. Long-transcript analysis whose
//     output cascades into every downstream surface (Sessions tab,
//     star map, goal increments). Quality matters; price is fine.
//   * Opener / response parser / growth narrative / style calibration
//     — gpt-5-mini. All four are mechanical or synthesis-from-pre-
//     digested-signals tasks where the cheap mini tier is plenty.
//
// Previous: gpt-5.4-mini across the board (2026-04-28 migration).
// gpt-5.4-mini doesn't appear in OpenAI's 2026-04-29 pricing table
// — possible sunset — and even if it lingers, the live coaching
// has been the one place quality regression matters most.
//
// Quality bar to hold against: the coaching nuance we relied on
// gpt-5 for in production. If any specific call regresses on its
// new pin, swap that one (not the others).
export const MODEL_SESSION_START = "gpt-5-mini";
export const MODEL_SESSION_CHAT = "gpt-5.2";
export const MODEL_SESSION_END = "gpt-5";
export const MODEL_SESSION_RESPONSE = "gpt-5-mini";
export const MODEL_GROWTH_NARRATIVE = "gpt-5-mini";
export const MODEL_STYLE_CALIBRATION = "gpt-5-mini";

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

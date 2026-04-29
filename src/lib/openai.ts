import "server-only";

import OpenAI from "openai";

// Model pins (reference/decisions.md § Tech Stack → Model usage).
// Changing these is a deliberate coaching-parity decision, not a free swap.
//
// 2026-04-29 (later) — consolidate on the 5.4 family. gpt-5 has been
// retired by OpenAI and gpt-5.2 is being phased out next, so the
// mid-day mix of {5.4, 5.2, 5, 5-mini} can no longer hold. Two tiers:
//   * gpt-5.4 — every call where output quality matters: live chat,
//     session-end analyzer (its output cascades everywhere downstream),
//     response parser (data-integrity stakes — wrong disagreement
//     classification silently deletes real user progress), and
//     growth narrative (user reads it on the home screen).
//   * gpt-5.4-mini — the truly unimportant calls: the mechanical
//     session opener (greeting + acknowledge focus), and the style
//     calibration aggregator (internal synthesis from pre-digested
//     signals, never user-facing).
//
// Quality bar to hold against: the coaching nuance we relied on
// gpt-5 for in production. If any specific call regresses, the
// next move is to bump reasoning effort on it before swapping models.
export const MODEL_SESSION_START = "gpt-5.4-mini";
export const MODEL_SESSION_CHAT = "gpt-5.4";
export const MODEL_SESSION_END = "gpt-5.4";
export const MODEL_SESSION_RESPONSE = "gpt-5.4";
export const MODEL_GROWTH_NARRATIVE = "gpt-5.4";
export const MODEL_STYLE_CALIBRATION = "gpt-5.4-mini";

// Voice mode models. Whisper for speech-to-text (user → coach),
// TTS-1-HD for the coach's voice (coach → user). Voice "nova" picked
// for warmth and professional pacing — coaching needs a calm,
// grounded voice without being saccharine. Speed slightly under 1
// so the coach doesn't sound rushed.
export const MODEL_TRANSCRIBE = "whisper-1";
export const MODEL_TTS = "tts-1-hd";
export const TTS_VOICE = "nova";
export const TTS_SPEED = 0.95;

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

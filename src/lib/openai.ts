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
// gpt-4o-mini-tts for the coach's voice (coach → user). The newer
// model gives access to all 13 OpenAI voices so each of the seven
// coach personas can have their own voice (see ttsVoiceForCoach).
export const MODEL_TRANSCRIBE = "whisper-1";
export const MODEL_TTS = "gpt-4o-mini-tts";

// Per-coach voice + speed mapping. Each coach picks the OpenAI voice
// that best matches their gender and personality archetype:
//   buddy   → alloy   — friendly, warm male
//   dante   → onyx    — deep, measured male, fits "wise and thoughtful"
//   kelly   → shimmer — bright, expressive female, fits "energetic"
//   maya    → sage    — calm, grounded female, fits "calm and centered"
//   orion   → verse   — expressive, dynamic male, fits "adventurous"
//   pierre  → fable   — British-accented male, fits "sophisticated"
//   sigmund → echo    — smooth, even male, fits "analytical and deep"
//
// Speed is 0.9 for the deliberately contemplative archetypes (Maya,
// Dante) and 0.95 for the rest — voice itself carries most of the
// personality, so speed is a small accent rather than a big knob.
//
// Fallback: any unknown coach_name (legacy data, future drift) falls
// back to nova @ 0.95 — the original single-voice default.
const COACH_VOICE_MAP: Record<string, string> = {
  buddy: "alloy",
  dante: "onyx",
  kelly: "shimmer",
  maya: "sage",
  orion: "verse",
  pierre: "fable",
  sigmund: "echo",
};

const COACH_SPEED_MAP: Record<string, number> = {
  dante: 0.9,
  maya: 0.9,
};

const DEFAULT_TTS_VOICE = "nova";
const DEFAULT_TTS_SPEED = 0.95;

export function ttsVoiceForCoach(coachName: string | null): string {
  if (!coachName) return DEFAULT_TTS_VOICE;
  return COACH_VOICE_MAP[coachName.toLowerCase()] ?? DEFAULT_TTS_VOICE;
}

export function ttsSpeedForCoach(coachName: string | null): number {
  if (!coachName) return DEFAULT_TTS_SPEED;
  return COACH_SPEED_MAP[coachName.toLowerCase()] ?? DEFAULT_TTS_SPEED;
}

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

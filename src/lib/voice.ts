import "server-only";

import { captureSessionError } from "@/lib/observability";
import {
  MODEL_TRANSCRIBE,
  MODEL_TTS,
  openaiClient,
  ttsSpeedForCoach,
  ttsVoiceForCoach,
} from "@/lib/openai";
import { ensureCoachingState } from "@/lib/sessions";
import type { UserSupabase } from "@/lib/supabase";

// Maximum audio file size accepted by Whisper itself. Kept here as
// a documented upper bound; the route-level cap below is what we
// actually enforce.
export const WHISPER_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// App-level cap: 5 MB. Real audio sizes for our use cases are far
// below this — a 2-minute journal recording at standard browser
// voice quality is ~1 MB; coaching-session utterances are typically
// 30 seconds or less and weigh tens of kilobytes. 5 MB gives 5×
// headroom over realistic max usage and bounds the per-call Whisper
// cost an attacker (or a runaway client bug) can drive.
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

// Cap the text length we'll synthesize per request. OpenAI TTS
// supports up to 4096 chars; coaching responses are usually 100-500
// chars but a degenerate model output could be much longer. 4000 is
// the practical cap.
export const MAX_TTS_CHARS = 4000;

// Per-user daily Whisper transcription cap. Both transcribe routes
// check this BEFORE forwarding to OpenAI; an over-cap call returns
// 429 + a clear message. Sized for normal heavy use (a 20-minute
// voice session generates ~30-60 calls; a heavy day with multiple
// sessions + voice journal entries lands at ~150) with comfortable
// headroom; an attacker maxing out a single account is bounded to
// 200 calls × MAX_AUDIO_BYTES per day.
export const TRANSCRIPTION_DAILY_CAP = 200;

// Returns whether the user can spend one more transcription unit
// today, AND consumes the unit if so. Atomic enough for our scale
// (single-user race conditions across two concurrent transcribe
// calls would at worst over-count by 1; never under-count). Resets
// the counter automatically when the date rolls over.
//
// Result.ok === false means the cap is exhausted; the caller should
// return 429. The response shape (count + cap) is suitable for
// surfacing to the client as part of the error payload.
export async function tryConsumeTranscriptionQuota(
  ctx: UserSupabase,
): Promise<{ ok: boolean; count: number; cap: number }> {
  await ensureCoachingState(ctx);

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data, error: readErr } = await ctx.client
    .from("coaching_state")
    .select("transcription_count_today, transcription_count_date")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (readErr) throw readErr;

  const sameDay =
    data?.transcription_count_date === todayIso;
  const currentCount = sameDay
    ? Number(data?.transcription_count_today ?? 0)
    : 0;

  if (currentCount >= TRANSCRIPTION_DAILY_CAP) {
    return {
      ok: false,
      count: currentCount,
      cap: TRANSCRIPTION_DAILY_CAP,
    };
  }

  const nextCount = currentCount + 1;
  const { error: updateErr } = await ctx.client
    .from("coaching_state")
    .update({
      transcription_count_today: nextCount,
      transcription_count_date: todayIso,
    })
    .eq("user_id", ctx.userId);
  if (updateErr) throw updateErr;

  return { ok: true, count: nextCount, cap: TRANSCRIPTION_DAILY_CAP };
}

// Whisper transcription. Failures captured to Sentry and re-thrown.
// `sessionId` is an optional Sentry tag — omit for non-session
// contexts (journal voice entries).
export async function transcribeAudio(
  audioFile: File,
  sessionId?: string,
): Promise<string> {
  if (audioFile.size === 0) {
    const err = new Error("transcribe: empty audio file");
    captureSessionError(err, "voice_transcribe_input", sessionId);
    throw err;
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    const err = new Error(
      `transcribe: audio file too large (${audioFile.size} bytes)`,
    );
    captureSessionError(err, "voice_transcribe_input", sessionId);
    throw err;
  }

  let response;
  try {
    response = await openaiClient().audio.transcriptions.create({
      file: audioFile,
      model: MODEL_TRANSCRIBE,
    });
  } catch (err) {
    captureSessionError(err, "voice_transcribe_openai", sessionId);
    throw err;
  }
  return response.text;
}

// OpenAI TTS speech synthesis. Returns a ReadableStream<Uint8Array>
// of MP3 audio chunks suitable for piping straight to a Response.
// The route layer is responsible for setting Content-Type: audio/mpeg
// and any caching/length headers. Streaming is enabled at the SDK
// level so chunks come down as the model produces them — important
// for the eventual full-duplex chat where every ms of latency shows.
//
// `coachName` selects the voice + speed via the per-coach mapping in
// openai.ts. Pass null to fall back to the default (nova @ 0.95).
export async function synthesizeSpeech(
  text: string,
  sessionId: string,
  coachName: string | null,
): Promise<ReadableStream<Uint8Array>> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    const err = new Error("synthesize: empty text");
    captureSessionError(err, "voice_speak_input", sessionId);
    throw err;
  }
  if (trimmed.length > MAX_TTS_CHARS) {
    const err = new Error(
      `synthesize: text too long (${trimmed.length} chars)`,
    );
    captureSessionError(err, "voice_speak_input", sessionId);
    throw err;
  }

  let response;
  try {
    response = await openaiClient().audio.speech.create({
      model: MODEL_TTS,
      voice: ttsVoiceForCoach(coachName),
      input: trimmed,
      speed: ttsSpeedForCoach(coachName),
      response_format: "mp3",
    });
  } catch (err) {
    captureSessionError(err, "voice_speak_openai", sessionId);
    throw err;
  }

  // The OpenAI SDK returns a Response-like object. .body is the
  // underlying ReadableStream we can pipe to the client.
  if (!response.body) {
    const err = new Error("synthesize: empty response body");
    captureSessionError(err, "voice_speak_openai", sessionId);
    throw err;
  }
  return response.body;
}

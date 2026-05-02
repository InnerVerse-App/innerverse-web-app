import "server-only";

import { captureSessionError } from "@/lib/observability";
import {
  MODEL_TRANSCRIBE,
  MODEL_TTS,
  openaiClient,
  ttsSpeedForCoach,
  ttsVoiceForCoach,
} from "@/lib/openai";

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

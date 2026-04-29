import "server-only";

import { captureSessionError } from "@/lib/observability";
import {
  MODEL_TRANSCRIBE,
  MODEL_TTS,
  openaiClient,
  TTS_SPEED,
  TTS_VOICE,
} from "@/lib/openai";

// Maximum audio file size we'll accept on the transcribe endpoint.
// 25 MB matches OpenAI's Whisper API limit. A typical 30-second
// coaching utterance at 16 kHz mono is well under 1 MB, so this is
// generous headroom — if a request exceeds it the user is doing
// something pathological (a 30-minute monologue) and we want to
// reject before hitting the upstream API.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Cap the text length we'll synthesize per request. OpenAI TTS
// supports up to 4096 chars; coaching responses are usually 100-500
// chars but a degenerate model output could be much longer. 4000 is
// the practical cap.
export const MAX_TTS_CHARS = 4000;

// Whisper transcription. Takes a File or Blob (already extracted
// from FormData on the route side) and returns the transcribed
// text. Failures are captured to Sentry and re-thrown so the route
// handler can return an appropriate status code.
export async function transcribeAudio(
  audioFile: File,
  sessionId: string,
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
export async function synthesizeSpeech(
  text: string,
  sessionId: string,
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
      voice: TTS_VOICE,
      input: trimmed,
      speed: TTS_SPEED,
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

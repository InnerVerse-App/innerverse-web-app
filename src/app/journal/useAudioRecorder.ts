"use client";

import { useEffect, useRef, useState } from "react";

// Push-to-record audio capture hook for the journal composer's mic
// button. Tap to start, tap to stop, get back the transcribed text.
//
// The hook owns the full lifecycle including the Whisper round-trip,
// so the composer only has one phase machine to react to. Callers
// pass a `transcribe` function that uploads the audio blob and
// resolves with the transcribed text — keeping the network call
// out of the hook avoids importing fetch infrastructure here.
//
// Auto-stop at MAX_RECORDING_MS prevents runaway uploads if the
// user taps record then walks away.

export type RecordingPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing"
  | "error";

const MAX_RECORDING_MS = 120_000;
const MIME_PREFERENCE = ["audio/webm", "audio/ogg", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mime of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

type Options = {
  // Uploads the captured audio blob to the server and returns the
  // transcribed text. Called from inside the hook after a successful
  // stop, with the phase pinned to "transcribing" until it resolves.
  transcribe: (blob: Blob) => Promise<string>;
};

export function useAudioRecorder({ transcribe }: Options) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const stopResolverRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Centralized cleanup so onstop, onerror, and unmount all release
  // the same resources. Without this, an onerror event left the mic
  // light on and the 4Hz tick interval running forever.
  function releaseResources() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickIntervalRef.current != null) {
      window.clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    chunksRef.current = [];
    const resolver = stopResolverRef.current;
    stopResolverRef.current = null;
    resolver?.(null);
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      releaseResources();
    };
  }, []);

  async function start(): Promise<void> {
    if (phase === "recording" || phase === "requesting" || phase === "transcribing") {
      return;
    }
    setErrorMessage(null);
    setPhase("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Microphone permission denied. Allow it in your browser settings to record voice entries."
            : err.message
          : "Couldn't access the microphone.";
      setErrorMessage(msg);
      setPhase("error");
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      releaseResources();
      setErrorMessage(
        err instanceof Error ? err.message : "Couldn't start recording.",
      );
      setPhase("error");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const finalMime = recorder.mimeType || mimeType || "audio/webm";
      const blob =
        chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: finalMime })
          : null;
      const resolver = stopResolverRef.current;
      stopResolverRef.current = null;
      releaseResources();
      resolver?.(blob);
    };
    recorder.onerror = () => {
      const resolver = stopResolverRef.current;
      stopResolverRef.current = null;
      releaseResources();
      resolver?.(null);
      setErrorMessage("Recording error.");
      setPhase("error");
    };

    recorderRef.current = recorder;
    recorder.start();
    startTimeRef.current = Date.now();
    setRecordingMs(0);
    setPhase("recording");

    stopTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    }, MAX_RECORDING_MS);

    // 4 Hz timer feeds the on-screen MM:SS display. Stops via
    // releaseResources when recording ends.
    tickIntervalRef.current = window.setInterval(() => {
      setRecordingMs(Date.now() - startTimeRef.current);
    }, 250);
  }

  // Stops the current recording, awaits Whisper transcription, and
  // returns the resulting text. The hook drives the full
  // recording → transcribing → idle/error transition internally.
  async function stopAndTranscribe(): Promise<string | null> {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return null;

    const blob = await new Promise<Blob | null>((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
    if (!blob) {
      // onerror path already moved phase to "error". onstop with no
      // chunks just falls through to idle.
      if (phase !== "error") setPhase("idle");
      return null;
    }

    setPhase("transcribing");
    try {
      const text = await transcribe(blob);
      setPhase("idle");
      return text;
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Couldn't transcribe — try again or type instead.",
      );
      setPhase("error");
      return null;
    }
  }

  return {
    phase,
    errorMessage,
    recordingMs,
    maxRecordingMs: MAX_RECORDING_MS,
    start,
    stopAndTranscribe,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";

// Voice mode composer. PR 3 of 5: VAD (voice activity detection)
// replaces the previous push-to-talk button. Continuous listening:
// the user just speaks, and the system auto-detects start/end of
// speech using Silero VAD (an ONNX model running in the browser via
// @ricky0123/vad-web).
//
// State machine:
//   loading     — VAD library + ONNX model still downloading
//   listening   — VAD is active, watching for speech
//   recording   — VAD detected speech, capturing the utterance
//   transcribing — sending captured audio to /transcribe
//   thinking    — chat call running
//   speaking    — coach audio playing back
//   paused      — user manually stopped listening
//   error       — something failed
//
// VAD is paused during transcribing/thinking/speaking so we don't
// pick up our own audio (PR 5 will add interruption — for now,
// silent passthrough during the coach's turn).
//
// The VAD library + WASM are dynamic-imported so users who never
// engage voice mode don't pay the bundle cost.

type Phase =
  | "loading"
  | "listening"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "paused"
  | "error";

type Props = {
  sessionId: string;
  disabled: boolean;
  sendChat: (text: string) => Promise<string>;
};

// CDN paths for the VAD model + ONNX runtime WASM. Avoids needing to
// copy these into public/ at build time.
const VAD_ASSET_BASE =
  "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";
const ORT_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";

// Minimal subset of MicVAD's API that we actually call. Lets us type
// the dynamic-import return without pulling the full library types
// into the client bundle eagerly. start/pause/destroy are async in
// the underlying library but we don't await them — fire and forget
// is fine for these lifecycle calls.
type MicVADInstance = {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
};

export function VoiceComposer({ sessionId, disabled, sendChat }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const vadRef = useRef<MicVADInstance | null>(null);
  // encodeWAV is captured during dynamic-import so we can reuse it
  // for each utterance without re-importing.
  const encodeWAVRef = useRef<((audio: Float32Array) => ArrayBuffer) | null>(
    null,
  );
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  // Tracks the latest phase synchronously so VAD callbacks (which
  // close over an old setState reading) can dispatch on current
  // truth instead of stale state. React state alone is async-safe
  // but this is a callback fired by the worklet thread.
  const phaseRef = useRef<Phase>("loading");
  function setPhaseSafe(next: Phase): void {
    phaseRef.current = next;
    setPhase(next);
  }

  // Dynamic import + VAD bootstrap. Runs once on mount; teardown
  // destroys the VAD instance and releases the mic stream.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vadModule = await import("@ricky0123/vad-web");
        encodeWAVRef.current = vadModule.utils.encodeWAV;
        if (cancelled) return;
        const vad = await vadModule.MicVAD.new({
          baseAssetPath: VAD_ASSET_BASE,
          onnxWASMBasePath: ORT_WASM_BASE,
          // Default thresholds nudged slightly: coaching pauses are
          // longer than typical conversation pauses, so we extend
          // the redemption window so a thoughtful "...uhm..." doesn't
          // accidentally end the utterance early.
          positiveSpeechThreshold: 0.55,
          negativeSpeechThreshold: 0.4,
          // Minimum utterance length — shorter than this counts as a
          // misfire and is dropped (typical accidental cough).
          minSpeechMs: 250,
          // Pad before the detected speech to capture leading breaths.
          preSpeechPadMs: 250,
          // Wait this long after speech-end probability drops before
          // firing onSpeechEnd. Coaching needs longer pauses than
          // chat — set generously.
          redemptionMs: 800,
          onSpeechStart: () => {
            if (phaseRef.current === "listening") {
              setPhaseSafe("recording");
            }
          },
          onSpeechEnd: (audio) => {
            // We only act on speech that ended while we were actively
            // recording. If a turn is in flight (transcribing,
            // thinking, speaking) we ignore stray callbacks.
            if (phaseRef.current === "recording") {
              void handleSpeechEnd(audio);
            }
          },
          onVADMisfire: () => {
            if (phaseRef.current === "recording") {
              setPhaseSafe("listening");
            }
          },
        });
        if (cancelled) {
          vad.destroy();
          return;
        }
        vadRef.current = vad;
        vad.start();
        setPhaseSafe("listening");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Microphone permission denied. Allow it in your browser settings to use voice mode."
              : err.message
            : "Couldn't start voice mode.";
        setErrorMsg(message);
        setPhaseSafe("error");
      }
    })();
    return () => {
      cancelled = true;
      vadRef.current?.destroy();
      vadRef.current = null;
      const audioEl = audioElRef.current;
      if (audioEl) {
        audioEl.pause();
        audioEl.src = "";
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSpeechEnd(audio: Float32Array): Promise<void> {
    const encode = encodeWAVRef.current;
    if (!encode) {
      setErrorMsg("Voice mode not ready");
      setPhaseSafe("error");
      return;
    }
    // Pause VAD while we run the turn. Avoids picking up our own
    // playback as input. Resumed once the coach's audio finishes.
    vadRef.current?.pause();

    setPhaseSafe("transcribing");
    let transcribed: string;
    try {
      const wav = encode(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      const fd = new FormData();
      fd.append("file", blob, "audio.wav");
      const res = await fetch(`/api/sessions/${sessionId}/transcribe`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const data = (await res.json()) as { text?: string };
      transcribed = (data.text ?? "").trim();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
      setPhaseSafe("error");
      return;
    }
    if (!transcribed) {
      // No speech detected by Whisper — silent passthrough, resume
      // listening for the next utterance.
      vadRef.current?.start();
      setPhaseSafe("listening");
      return;
    }

    setPhaseSafe("thinking");
    let responseText: string;
    try {
      responseText = await sendChat(transcribed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Coach response failed");
      setPhaseSafe("error");
      return;
    }
    if (!responseText.trim()) {
      vadRef.current?.start();
      setPhaseSafe("listening");
      return;
    }

    setPhaseSafe("speaking");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: responseText }),
      });
      if (!res.ok) throw new Error(`Speech synthesis failed (${res.status})`);
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = url;
      const a = new Audio(url);
      audioElRef.current = a;
      a.onended = () => {
        // Coach finished speaking — resume VAD for the next turn.
        vadRef.current?.start();
        setPhaseSafe("listening");
      };
      a.onerror = () => {
        setErrorMsg("Audio playback failed");
        setPhaseSafe("error");
      };
      await a.play();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't play coach voice",
      );
      setPhaseSafe("error");
    }
  }

  function pauseListening(): void {
    if (phase !== "listening") return;
    vadRef.current?.pause();
    setPhaseSafe("paused");
  }

  function resumeListening(): void {
    if (phase !== "paused") return;
    vadRef.current?.start();
    setPhaseSafe("listening");
  }

  function dismissError(): void {
    setErrorMsg(null);
    if (vadRef.current) {
      vadRef.current.start();
      setPhaseSafe("listening");
    } else {
      setPhaseSafe("loading");
    }
  }

  const statusText = (() => {
    switch (phase) {
      case "loading":
        return "Starting voice mode…";
      case "listening":
        return "Listening — speak whenever you're ready";
      case "recording":
        return "Hearing you…";
      case "transcribing":
        return "Transcribing…";
      case "thinking":
        return "Coach is thinking…";
      case "speaking":
        return "Coach is speaking…";
      case "paused":
        return "Paused — tap to resume listening";
      case "error":
        return errorMsg ?? "Something went wrong";
    }
  })();

  // The big visual element: a circle that pulses according to the
  // current phase. No push-to-talk button anymore — the user just
  // speaks. The circle is purely decorative + status; tapping it
  // toggles between listening and paused.
  const ringClass = (() => {
    switch (phase) {
      case "listening":
        return "border-brand-primary/60 bg-brand-primary/10 animate-pulse";
      case "recording":
        return "border-red-400 bg-red-500/25 animate-pulse";
      case "transcribing":
      case "thinking":
        return "border-brand-primary/40 bg-brand-primary/5";
      case "speaking":
        return "border-brand-primary bg-brand-primary/30 animate-pulse";
      case "paused":
        return "border-neutral-500/60 bg-neutral-500/10";
      case "error":
        return "border-red-400/60 bg-red-500/10";
      case "loading":
      default:
        return "border-neutral-500/40 bg-neutral-500/5";
    }
  })();

  function onCircleTap(): void {
    if (phase === "listening") {
      pauseListening();
    } else if (phase === "paused") {
      resumeListening();
    }
  }

  const circleDisabled =
    disabled ||
    phase === "loading" ||
    phase === "recording" ||
    phase === "transcribing" ||
    phase === "thinking" ||
    phase === "speaking" ||
    phase === "error";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
      <button
        type="button"
        onClick={onCircleTap}
        disabled={circleDisabled}
        aria-label={statusText}
        className={
          "h-20 w-20 rounded-full border-2 transition active:scale-95 disabled:cursor-default " +
          ringClass
        }
      >
        <MicIcon className="mx-auto h-8 w-8 text-white" />
      </button>
      <p className="text-center text-sm text-neutral-300">{statusText}</p>
      {phase === "error" ? (
        <button
          type="button"
          onClick={dismissError}
          className="text-xs text-neutral-400 underline-offset-4 hover:text-white hover:underline"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

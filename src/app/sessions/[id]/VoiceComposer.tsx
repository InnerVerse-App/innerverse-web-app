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
  // sendChat now takes an optional onSpeakable callback. Voice mode
  // passes one to start TTS as soon as the chat response yields a
  // sentence-bounded chunk, reducing the gap between "coach finished
  // thinking" and "user hears coach voice."
  sendChat: (
    text: string,
    onSpeakable?: (chunk: string) => void,
  ) => Promise<string>;
  // Aborts the in-flight chat stream — used during interruption when
  // the user starts speaking over the coach. Cancels the upstream
  // OpenAI call too.
  abortChat: () => void;
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

export function VoiceComposer({
  sessionId,
  disabled,
  sendChat,
  abortChat,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const vadRef = useRef<MicVADInstance | null>(null);
  // encodeWAV is captured during dynamic-import so we can reuse it
  // for each utterance without re-importing.
  const encodeWAVRef = useRef<((audio: Float32Array) => ArrayBuffer) | null>(
    null,
  );
  // Streaming-TTS playback state. The chat response is chunked into
  // sentence-bounded pieces, each of which gets its own TTS call.
  // The resulting audio elements are queued up and played
  // sequentially. `chatCompleteRef` flips true when the chat stream
  // ends, so the last-chunk playback completion can transition us
  // back to listening.
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const audioUrlsRef = useRef<string[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatCompleteRef = useRef(false);
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
            const prev = phaseRef.current;
            if (prev === "listening") {
              setPhaseSafe("recording");
            } else if (prev === "speaking" || prev === "thinking") {
              // INTERRUPTION: user spoke over the coach. Abort any
              // in-flight chat stream, dump the audio queue, and
              // start capturing the new turn. Browser echo
              // cancellation (configured via getUserMedia in the
              // VAD library) handles the loopback case where the
              // coach's playback would otherwise self-trigger VAD.
              interruptCoach();
              setPhaseSafe("recording");
            }
            // transcribing / paused / loading / error / recording:
            // ignore stray events.
          },
          onSpeechEnd: (audio) => {
            // Only process speech that ended while we were
            // recording. Late callbacks during transcribing /
            // thinking / speaking are ignored — they'd be the tail
            // of a previously-handled utterance.
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
      stopAndClearPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Interrupt: user started speaking during the coach's response.
  // Abort the chat stream (if still in flight), drop the audio queue,
  // and let the regular onSpeechEnd path pick up the user's new turn.
  // Marking chatCompleteRef true ensures the audio-queue completion
  // logic doesn't trigger a stale "back to listening" transition
  // after we've already moved on.
  function interruptCoach(): void {
    abortChat();
    stopAndClearPlayback();
    chatCompleteRef.current = true;
  }

  // Stop any currently-playing audio, clear the queue, and revoke
  // every blob URL we created during the turn. Called on unmount,
  // on error, and during interruption.
  function stopAndClearPlayback(): void {
    const current = currentAudioRef.current;
    if (current) {
      current.pause();
      current.src = "";
      currentAudioRef.current = null;
    }
    audioQueueRef.current = [];
    for (const url of audioUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    audioUrlsRef.current = [];
  }

  // Play the next audio in the queue. If the queue is empty, mark
  // the speaking phase complete only when the chat stream is also
  // done. Otherwise we just wait — the next enqueue will pick this
  // back up.
  function playNextInQueue(): void {
    const next = audioQueueRef.current.shift();
    if (!next) {
      currentAudioRef.current = null;
      if (chatCompleteRef.current) {
        // All chunks done + chat finished — return to listening.
        vadRef.current?.start();
        setPhaseSafe("listening");
      }
      return;
    }
    currentAudioRef.current = next;
    next.onended = playNextInQueue;
    next.onerror = () => {
      setErrorMsg("Audio playback failed");
      setPhaseSafe("error");
    };
    void next.play();
  }

  // Synthesize a single chunk and enqueue the resulting audio. If
  // nothing is currently playing, kick off playback. Errors are
  // swallowed silently — a single chunk failure shouldn't kill the
  // whole turn (the chat already happened).
  async function synthesizeAndQueue(chunk: string): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      const audio = new Audio(url);
      audioQueueRef.current.push(audio);
      // Start playback if nothing is currently playing AND we're in
      // the speaking phase (or we just transitioned into it).
      if (!currentAudioRef.current) {
        // Move to speaking phase as soon as audio is ready, even if
        // chat stream isn't done. The earlier we start, the lower
        // the user-perceived latency.
        if (phaseRef.current !== "speaking") {
          setPhaseSafe("speaking");
        }
        playNextInQueue();
      }
    } catch {
      // Silent: dropping a single chunk is better than aborting the
      // whole turn. Sentry-side capture happens in /speak.
    }
  }

  async function handleSpeechEnd(audio: Float32Array): Promise<void> {
    const encode = encodeWAVRef.current;
    if (!encode) {
      setErrorMsg("Voice mode not ready");
      setPhaseSafe("error");
      return;
    }
    // VAD stays running through transcribe/think/speak so the user
    // can interrupt at any point. Browser echo cancellation handles
    // the playback-loopback case. The phase guards in onSpeechStart
    // / onSpeechEnd prevent stale callbacks from firing wrong
    // transitions.

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

    // Reset playback state for this turn — fresh queue + fresh
    // chat-complete flag.
    stopAndClearPlayback();
    chatCompleteRef.current = false;

    setPhaseSafe("thinking");
    let responseText: string;
    try {
      responseText = await sendChat(transcribed, (chunk) => {
        // Each speakable chunk gets its own /speak call. The first
        // one to enqueue triggers playback; subsequent chunks queue
        // up and play sequentially. Streaming-TTS-of-sorts: while
        // the chat is still streaming on top, audio is already
        // playing on the bottom.
        void synthesizeAndQueue(chunk);
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Coach response failed");
      setPhaseSafe("error");
      return;
    }

    // Chat stream is done. Mark the flag so the audio queue's
    // last-item completion knows it's safe to transition back to
    // listening. If no chunks ever queued (empty response, error
    // partway through), transition immediately.
    chatCompleteRef.current = true;
    if (!currentAudioRef.current && audioQueueRef.current.length === 0) {
      vadRef.current?.start();
      setPhaseSafe("listening");
      return;
    }

    if (!responseText.trim()) {
      // Defensive: chat returned empty. Already handled above by the
      // queue check, but keep this for clarity.
      stopAndClearPlayback();
      vadRef.current?.start();
      setPhaseSafe("listening");
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

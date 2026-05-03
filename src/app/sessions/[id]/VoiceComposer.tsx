"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";

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
  // When non-null, this text is TTS-played once at mount BEFORE the
  // VAD starts listening. ChatView passes the existing AI opener
  // (or the curated first-session welcome) when the user enters the
  // session in voice mode and hasn't spoken yet, so they hear the
  // coach instead of having to read the message. On any failure
  // (network, /speak error, audio playback issue) we fall through
  // to listening — the message stays visible on screen.
  speakOnMount: string | null;
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
  speakOnMount,
}: Props) {
  // Pin the speakOnMount value taken at mount in a ref so re-renders
  // (state updates, etc.) can't re-trigger the welcome playback.
  const speakOnMountRef = useRef<string | null>(speakOnMount);
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
  // Decoded audio buffers are queued up and played sequentially via
  // BufferSourceNodes off a single shared AudioContext.
  // `chatCompleteRef` flips true when the chat stream ends, so the
  // last-chunk playback completion can transition us back to
  // listening.
  //
  // Why Web Audio instead of HTMLAudioElement: on iOS, an HTMLAudio
  // element's play() is silently blocked when called outside the
  // immediate user-gesture window. The first turn would play (gesture
  // still active from voice-mode click) but subsequent turns would
  // fail without rejection or onerror — silent dropout, no telemetry.
  // A Web Audio AudioContext, once resumed via gesture, stays
  // unlocked indefinitely; BufferSource.start() works regardless of
  // gesture proximity. This is how YouTube, Spotify, Whisper Web etc.
  // do non-gesture-driven media playback on iOS.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferQueueRef = useRef<AudioBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
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

  // Lazy-init the shared AudioContext. Called from useEffect on
  // mount AND from any user-tap handler — whichever runs first
  // creates it, subsequent calls just resume() if iOS suspended it.
  // The AudioContext must be created/resumed from inside a user-
  // gesture-derived task on iOS for it to actually produce sound.
  function ensureAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      // Fire-and-forget; the next BufferSource.start() will work once
      // the resume() promise settles, even if we don't await here.
      void ctx.resume();
    }
    return ctx;
  }

  // Dynamic import + VAD bootstrap. Runs once on mount; teardown
  // destroys the VAD instance and releases the mic stream.
  useEffect(() => {
    let cancelled = false;
    // Pre-create the AudioContext now so any subsequent user gesture
    // (mic-circle tap, test buttons) is enough to fully unlock it.
    ensureAudioContext();
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
          // chat — a user pausing mid-thought should not be cut off
          // by the coach. 4s is on the high end (you'll feel a beat
          // of "is it listening?" before the coach takes over) but
          // operator preferred this over interruption risk. Tunable;
          // revisit if testers report sluggishness vs being cut off.
          redemptionMs: 4000,
          onSpeechStart: () => {
            const prev = phaseRef.current;
            if (prev === "listening") {
              setPhaseSafe("recording");
            } else if (prev === "thinking") {
              // INTERRUPTION during thinking: coach is still
              // generating but no audio is playing yet, so VAD speech
              // here is unambiguously the user. Abort the chat
              // stream and start capturing the new turn.
              //
              // We DON'T interrupt during "speaking" anymore — VAD
              // is paused while the coach is speaking (see the
              // playback handlers below). Web Audio output bypasses
              // iOS's getUserMedia echo cancellation, so a running
              // VAD picks up the coach's own voice and false-fires
              // an interruption. Pausing VAD during speaking is
              // simpler and matches the operator's preference (no
              // interruption mid-coach-response).
              interruptCoach();
              setPhaseSafe("recording");
            }
            // speaking / transcribing / paused / loading / error /
            // recording: ignore stray events. (VAD shouldn't fire
            // during speaking since we pause it, but guard anyway.)
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

        // If ChatView told us to speak something at mount (welcome /
        // existing AI opener while in voice mode), play it FIRST and
        // delay starting the VAD until playback completes. Starting
        // VAD before would risk it picking up our own audio (browser
        // echo cancellation usually catches this, but not always —
        // and during the very first turn an interruption misfire
        // would be confusing). speakWelcomeThenListen always
        // transitions to listening at the end, success or not.
        const welcome = speakOnMountRef.current;
        if (welcome) {
          await speakWelcomeThenListen(welcome, vad);
        } else {
          vad.start();
          setPhaseSafe("listening");
        }
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
      // Close the shared AudioContext on unmount. .close() releases
      // the OS-level audio output handle so we're not holding it
      // when voice mode is dismissed. A new mount creates a fresh
      // context.
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
      audioCtxRef.current = null;
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

  // Stop any currently-playing audio and clear the pending buffer
  // queue. Called on unmount, on error, and during interruption. The
  // shared AudioContext stays alive across calls — only the source
  // and queue get torn down.
  function stopAndClearPlayback(): void {
    const current = currentSourceRef.current;
    if (current) {
      // Detach onended FIRST so source.stop() doesn't trigger our
      // queue-advancement and start a fresh chunk during teardown.
      current.onended = null;
      try {
        current.stop();
      } catch {
        // Already stopped or never started — both fine.
      }
      try {
        current.disconnect();
      } catch {
        // Already disconnected.
      }
      currentSourceRef.current = null;
    }
    audioBufferQueueRef.current = [];
  }

  // Play the next decoded buffer in the queue. If the queue is
  // empty, transition back to listening only when the chat stream
  // is also done — otherwise wait for the next enqueue.
  function playNextInQueue(): void {
    const next = audioBufferQueueRef.current.shift();
    if (!next) {
      currentSourceRef.current = null;
      if (chatCompleteRef.current) {
        vadRef.current?.start();
        setPhaseSafe("listening");
      }
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) {
      Sentry.captureMessage("voice_tts_no_audio_context", {
        level: "warning",
        tags: { stage: "voice_tts_play", session_id: sessionId },
      });
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = next;
    source.connect(ctx.destination);
    source.onended = () => {
      // Guard against late onended callbacks from a source that
      // stopAndClearPlayback already replaced — without this, an
      // interruption mid-playback could re-trigger queue advance
      // after we've already moved on.
      if (currentSourceRef.current === source) {
        playNextInQueue();
      }
    };
    currentSourceRef.current = source;
    try {
      source.start();
      Sentry.captureMessage("voice_tts_source_started", {
        level: "info",
        tags: { stage: "voice_tts_play", session_id: sessionId },
        extra: {
          duration: next.duration,
          ctxState: ctx.state,
          ctxSampleRate: ctx.sampleRate,
        },
      });
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        tags: { stage: "voice_tts_play", session_id: sessionId },
        extra: { errorName: (err as Error)?.name ?? "unknown" },
      });
      currentSourceRef.current = null;
      playNextInQueue();
    }
  }

  // Helper for diagnostic Sentry payloads. Pulls the audio element
  // state we care about for "did it actually play?" debugging. Only
  // used by the HTML5 test button now that the live flow runs on
  // Web Audio.
  function snapshotAudio(a: HTMLAudioElement) {
    return {
      duration: a.duration,
      currentTime: a.currentTime,
      paused: a.paused,
      muted: a.muted,
      volume: a.volume,
      readyState: a.readyState,
      networkState: a.networkState,
      ended: a.ended,
      error: a.error
        ? { code: a.error.code, message: a.error.message }
        : null,
    };
  }

  // Diagnostic: play a short test phrase via the SAME HTML5 <audio>
  // primitive the live flow USED TO use. After the Web Audio refactor
  // this lets us cross-check "is HTML5 audio working in this context"
  // against the live Web Audio path. Removable once we're confident
  // the dropout stays fixed.
  async function testPlayHtml5(): Promise<void> {
    Sentry.addBreadcrumb({
      category: "voice_test",
      message: "html5_start",
    });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test one two three." }),
      });
      Sentry.addBreadcrumb({
        category: "voice_test",
        message: `html5_fetch ${res.status}`,
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        Sentry.captureMessage("voice_test_html5_ended", {
          level: "info",
          tags: { stage: "voice_test_html5", session_id: sessionId },
          extra: snapshotAudio(audio),
        });
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        Sentry.captureMessage("voice_test_html5_error", {
          level: "warning",
          tags: { stage: "voice_test_html5", session_id: sessionId },
          extra: snapshotAudio(audio),
        });
        URL.revokeObjectURL(url);
      };
      try {
        await audio.play();
        Sentry.captureMessage("voice_test_html5_play_resolved", {
          level: "info",
          tags: { stage: "voice_test_html5", session_id: sessionId },
          extra: snapshotAudio(audio),
        });
        window.setTimeout(() => {
          Sentry.captureMessage("voice_test_html5_500ms", {
            level: "info",
            tags: { stage: "voice_test_html5", session_id: sessionId },
            extra: snapshotAudio(audio),
          });
        }, 500);
      } catch (err) {
        Sentry.captureException(err, {
          level: "warning",
          tags: { stage: "voice_test_html5_play", session_id: sessionId },
          extra: {
            errorName: (err as Error)?.name ?? "unknown",
            ...snapshotAudio(audio),
          },
        });
      }
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        tags: { stage: "voice_test_html5_fetch", session_id: sessionId },
      });
    }
  }

  // Diagnostic: play the same test phrase via Web Audio API. iOS
  // routes Web Audio through a different audio session category that
  // bypasses the silent switch. If this plays when the HTML5 path
  // doesn't, it confirms iOS-audio-session is the culprit and the
  // streaming queue should switch to Web Audio. Removable once fixed.
  async function testPlayWebAudio(): Promise<void> {
    Sentry.addBreadcrumb({
      category: "voice_test",
      message: "webaudio_start",
    });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test one two three." }),
      });
      Sentry.addBreadcrumb({
        category: "voice_test",
        message: `webaudio_fetch ${res.status}`,
      });
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        Sentry.captureMessage("voice_test_webaudio_no_ctor", {
          level: "warning",
          tags: { stage: "voice_test_webaudio", session_id: sessionId },
        });
        return;
      }
      const ctx = new Ctor();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      Sentry.addBreadcrumb({
        category: "voice_test",
        message: `webaudio_ctx ${ctx.state}`,
      });
      const audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        Sentry.captureMessage("voice_test_webaudio_ended", {
          level: "info",
          tags: { stage: "voice_test_webaudio", session_id: sessionId },
          extra: { duration: audioBuffer.duration, ctxState: ctx.state },
        });
      };
      source.start();
      Sentry.captureMessage("voice_test_webaudio_started", {
        level: "info",
        tags: { stage: "voice_test_webaudio", session_id: sessionId },
        extra: {
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          ctxState: ctx.state,
          ctxSampleRate: ctx.sampleRate,
          ctxBaseLatency:
            "baseLatency" in ctx ? (ctx as AudioContext).baseLatency : null,
        },
      });
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        tags: { stage: "voice_test_webaudio", session_id: sessionId },
      });
    }
  }

  // Synthesize a single chunk and enqueue the resulting audio. If
  // nothing is currently playing, kick off playback.
  //
  // Race-safe against interruption: when the user interrupts mid-
  // response, stopAndClearPlayback() empties the queue and the
  // phase moves to recording. But /speak calls for chunks that were
  // already in-flight will still resolve afterward. The phase guard
  // BEFORE pushing to the queue drops those late chunks silently
  // instead of starting stale playback during the user's new turn.
  //
  // Single-chunk errors are swallowed — dropping one chunk is better
  // than aborting the whole turn. Sentry-side capture lives in the
  // /speak route.
  // One-shot TTS playback for the message that's already on screen
  // when voice mode opens (the curated first-session welcome, or
  // a normal opener the user hasn't replied to yet). Plays via a
  // standalone Audio element rather than the chat-streaming queue
  // — simpler, and we know there's exactly one chunk. Always
  // transitions to listening at the end so a failed /speak call
  // doesn't strand the user in "speaking" forever.
  async function speakWelcomeThenListen(
    text: string,
    vad: MicVADInstance,
  ): Promise<void> {
    const finishToListening = () => {
      currentSourceRef.current = null;
      vad.start();
      setPhaseSafe("listening");
    };
    setPhaseSafe("speaking");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        Sentry.captureMessage("voice_welcome_speak_non200", {
          level: "warning",
          tags: { stage: "voice_welcome", session_id: sessionId },
          extra: { status: res.status },
        });
        finishToListening();
        return;
      }
      const bytes = await res.arrayBuffer();
      const ctx = ensureAudioContext();
      if (!ctx) {
        Sentry.captureMessage("voice_welcome_no_audio_context", {
          level: "warning",
          tags: { stage: "voice_welcome", session_id: sessionId },
        });
        finishToListening();
        return;
      }
      // .slice(0) gives decodeAudioData its own non-detached buffer
      // (some Safari versions detach the original after decode).
      const audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        Sentry.captureMessage("voice_welcome_source_ended", {
          level: "info",
          tags: { stage: "voice_welcome", session_id: sessionId },
          extra: { duration: audioBuffer.duration, ctxState: ctx.state },
        });
        finishToListening();
      };
      currentSourceRef.current = source;
      try {
        source.start();
        Sentry.captureMessage("voice_welcome_source_started", {
          level: "info",
          tags: { stage: "voice_welcome", session_id: sessionId },
          extra: {
            duration: audioBuffer.duration,
            ctxState: ctx.state,
            ctxSampleRate: ctx.sampleRate,
          },
        });
      } catch (err) {
        Sentry.captureException(err, {
          level: "warning",
          tags: { stage: "voice_welcome_play", session_id: sessionId },
          extra: { errorName: (err as Error)?.name ?? "unknown" },
        });
        finishToListening();
      }
    } catch (err) {
      Sentry.captureException(err, {
        level: "warning",
        tags: { stage: "voice_welcome_fetch", session_id: sessionId },
      });
      finishToListening();
    }
  }

  async function synthesizeAndQueue(chunk: string): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk }),
      });
      if (!res.ok) {
        // Capture so we have visibility on sustained TTS outages.
        // Single-chunk drops are still non-fatal to the chat flow
        // (the text reply landed in the transcript) but we want to
        // know if /speak starts erroring repeatedly.
        Sentry.captureMessage("voice_tts_chunk_dropped", {
          level: "warning",
          tags: { stage: "voice_tts_response", session_id: sessionId },
          extra: { status: res.status, chunkChars: chunk.length },
        });
        return;
      }
      const bytes = await res.arrayBuffer();
      // Late-arrival guard. If phase has moved past thinking/speaking
      // (interruption, error, unmount), drop this chunk silently.
      const phase = phaseRef.current;
      if (phase !== "thinking" && phase !== "speaking") {
        return;
      }
      const ctx = ensureAudioContext();
      if (!ctx) {
        Sentry.captureMessage("voice_tts_no_audio_context_at_decode", {
          level: "warning",
          tags: { stage: "voice_tts_fetch", session_id: sessionId },
        });
        return;
      }
      const audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
      audioBufferQueueRef.current.push(audioBuffer);
      if (!currentSourceRef.current) {
        if (phaseRef.current !== "speaking") {
          setPhaseSafe("speaking");
          // Pause VAD before any audio plays. Web Audio output
          // isn't filtered by getUserMedia's echo cancellation on
          // iOS, so a running VAD would treat the coach's own voice
          // as user speech and self-interrupt mid-response.
          void vadRef.current?.pause();
        }
        playNextInQueue();
      }
    } catch (err) {
      // Network error, decode error, or aborted fetch. Same non-fatal
      // posture for the chat flow; capture so debugging has data.
      Sentry.captureException(err, {
        level: "warning",
        tags: { stage: "voice_tts_fetch", session_id: sessionId },
      });
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
      if (!res.ok) {
        if (res.status === 429) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(
            body?.message ??
              "You've reached today's voice limit. Try again tomorrow or type instead.",
          );
        }
        throw new Error(`Transcription failed (${res.status})`);
      }
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
    if (!currentSourceRef.current && audioBufferQueueRef.current.length === 0) {
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
      <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-amber-200/80">
          Diagnostic — TTS test buttons
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={testPlayHtml5}
            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-100 hover:bg-amber-400/20"
          >
            Test HTML5 audio
          </button>
          <button
            type="button"
            onClick={testPlayWebAudio}
            className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-400/20"
          >
            Test Web Audio
          </button>
        </div>
        <p className="text-center text-[11px] text-neutral-400">
          Tap each. Tell me which one you hear.
        </p>
      </div>
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

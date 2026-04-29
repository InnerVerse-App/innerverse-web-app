"use client";

import { useEffect, useRef, useState } from "react";

// Voice mode composer. Replaces the textarea + send button when voice
// mode is on. Push-to-talk for now (PR 2 of 5); VAD lands in PR 3 to
// remove the manual button-hold and make the conversation continuous.
//
// State machine:
//   idle        — ready for the next turn, button is the affordance
//   recording   — mic open, capturing audio (button held down)
//   transcribing — sending audio to /api/sessions/[id]/transcribe
//   thinking    — chat call running, coach formulating response
//   speaking    — audio playing back via HTMLAudioElement
//   error       — something failed; user can dismiss and retry
//
// Owns its own phase. Parent ChatView passes:
//   sessionId — to scope the transcribe + speak endpoints
//   sendChat(text) — runs the chat exchange and returns the final
//     AI response text, which we then forward to /speak.

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

type Props = {
  sessionId: string;
  disabled: boolean;
  // Sends a text message through the existing chat pipeline. Resolves
  // with the final assistant response text once streaming completes.
  // Throws on error; VoiceComposer handles the failure UI.
  sendChat: (text: string) => Promise<string>;
};

export function VoiceComposer({ sessionId, disabled, sendChat }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Tracks the most recent audio blob URL so we can revoke it on
  // cleanup. createObjectURL leaks otherwise.
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup on unmount: stop any active recording, release the mic,
  // pause + revoke any in-flight audio playback.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore — we're tearing down anyway
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
  }, []);

  async function startRecording(): Promise<void> {
    if (phase !== "idle" || disabled) return;
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      // webm/opus is the most reliable cross-browser MediaRecorder
      // mimeType. Whisper accepts it directly.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      setPhase("recording");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Microphone permission denied. Allow it in your browser settings to use voice mode."
            : err.message
          : "Couldn't start recording.";
      setErrorMsg(message);
      setPhase("error");
    }
  }

  async function stopRecordingAndProcess(): Promise<void> {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    // MediaRecorder.stop() fires `dataavailable` then `stop` events
    // asynchronously. Wait for stop before continuing so we have all
    // the audio chunks.
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;

    const recorderMime = recorder.mimeType || "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: recorderMime });
    audioChunksRef.current = [];

    // Reject too-short utterances (likely accidental tap). Whisper
    // would charge us $0.0001 to transcribe silence anyway.
    if (blob.size < 1000) {
      setPhase("idle");
      return;
    }

    setPhase("transcribing");
    let transcribed: string;
    try {
      const fd = new FormData();
      const ext = recorderMime.includes("webm") ? "webm" : "mp4";
      fd.append("file", blob, `audio.${ext}`);
      const res = await fetch(`/api/sessions/${sessionId}/transcribe`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const data = (await res.json()) as { text?: string };
      transcribed = (data.text ?? "").trim();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
      setPhase("error");
      return;
    }
    if (!transcribed) {
      setPhase("idle");
      return;
    }

    setPhase("thinking");
    let responseText: string;
    try {
      responseText = await sendChat(transcribed);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Coach response failed",
      );
      setPhase("error");
      return;
    }

    if (!responseText.trim()) {
      // No text to speak; treat as a silent turn and reset.
      setPhase("idle");
      return;
    }

    setPhase("speaking");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: responseText }),
      });
      if (!res.ok) throw new Error(`Speech synthesis failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Revoke any previous URL before assigning the new one.
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onended = () => setPhase("idle");
      audio.onerror = () => {
        setErrorMsg("Audio playback failed");
        setPhase("error");
      };
      await audio.play();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't play coach voice",
      );
      setPhase("error");
    }
  }

  function dismissError(): void {
    setErrorMsg(null);
    setPhase("idle");
  }

  const buttonDisabled =
    disabled ||
    phase === "transcribing" ||
    phase === "thinking" ||
    phase === "speaking" ||
    phase === "error";

  const statusText = (() => {
    switch (phase) {
      case "idle":
        return "Hold to talk";
      case "recording":
        return "Listening…";
      case "transcribing":
        return "Transcribing…";
      case "thinking":
        return "Coach is thinking…";
      case "speaking":
        return "Coach is speaking…";
      case "error":
        return errorMsg ?? "Something went wrong";
    }
  })();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
      <button
        type="button"
        disabled={buttonDisabled}
        onPointerDown={(e) => {
          e.preventDefault();
          void startRecording();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          if (phase === "recording") void stopRecordingAndProcess();
        }}
        onPointerLeave={() => {
          // If the user drags off the button while recording, treat
          // as a release. Without this, the recording would continue
          // until the next pointerup anywhere on the document.
          if (phase === "recording") void stopRecordingAndProcess();
        }}
        aria-label={statusText}
        className={
          "h-20 w-20 rounded-full border-2 transition active:scale-95 disabled:cursor-progress " +
          (phase === "recording"
            ? "border-red-400 bg-red-500/20 animate-pulse"
            : phase === "speaking"
              ? "border-brand-primary bg-brand-primary/20"
              : phase === "error"
                ? "border-red-400/60 bg-red-500/10"
                : "border-brand-primary/60 bg-brand-primary/10 hover:bg-brand-primary/20")
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

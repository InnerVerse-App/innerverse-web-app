"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { PendingDots } from "@/app/_components/PendingDots";

import { createEntry, updateEntry } from "./actions";
import {
  MAX_ENTRY_CONTENT_CHARS,
  MAX_ENTRY_TITLE_CHARS,
  SOFT_ENTRY_CONTENT_CHARS,
} from "./limits";
import { useAudioRecorder, type RecordingPhase } from "./useAudioRecorder";

type Props =
  | { mode: "create"; entryId?: undefined; initial?: undefined }
  | {
      mode: "edit";
      entryId: string;
      initial: { title: string | null; content: string };
    };

// Insert text at the textarea's current cursor position, with
// boundary spaces inserted only when joining mid-word. Returns the
// new content + the resulting cursor index.
function insertAtCursor(
  current: string,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; cursor: number } {
  const before = current.slice(0, selectionStart);
  const after = current.slice(selectionEnd);
  const needsLead = before.length > 0 && !/[\s\n]$/.test(before);
  const needsTail = after.length > 0 && !/^[\s\n]/.test(after);
  const joined =
    before +
    (needsLead ? " " : "") +
    insert +
    (needsTail ? " " : "") +
    after;
  const next = joined.slice(0, MAX_ENTRY_CONTENT_CHARS);
  const cursor = Math.min(
    before.length + (needsLead ? 1 : 0) + insert.length,
    next.length,
  );
  return { next, cursor };
}

async function uploadForTranscription(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "journal-recording.webm");
  const res = await fetch("/api/journal/transcribe", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error("Transcription request failed");
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export function EntryComposer(props: Props) {
  const isEdit = props.mode === "edit";
  const [title, setTitle] = useState<string>(
    isEdit ? props.initial.title ?? "" : "",
  );
  const [content, setContent] = useState<string>(
    isEdit ? props.initial.content : "",
  );
  // Edit mode doesn't expose flagging here — the entry detail view
  // has its own dedicated star toggle. (Editing an already-flagged
  // entry shouldn't accidentally flip the flag.)
  const [flaggedAtCreate, setFlaggedAtCreate] = useState(false);

  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorder = useAudioRecorder({ transcribe: uploadForTranscription });

  // Auto-grow textarea as the content changes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  function appendDictatedText(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) =>
        (prev.length === 0 ? text : `${prev} ${text}`).slice(
          0,
          MAX_ENTRY_CONTENT_CHARS,
        ),
      );
      return;
    }
    const { next, cursor } = insertAtCursor(
      content,
      text,
      el.selectionStart ?? content.length,
      el.selectionEnd ?? content.length,
    );
    setContent(next);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(cursor, cursor);
    });
  }

  async function handleMicClick() {
    setSubmitError(null);
    if (recorder.phase === "recording") {
      const text = await recorder.stopAndTranscribe();
      if (text) appendDictatedText(text);
      return;
    }
    if (recorder.phase === "transcribing" || recorder.phase === "requesting") {
      return;
    }
    await recorder.start();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      setSubmitError("Write something first — empty entries can't be saved.");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (title.trim().length > 0) fd.set("title", title.trim());
      fd.set("content", trimmed);
      if (isEdit) {
        fd.set("id", props.entryId);
        await updateEntry(fd);
      } else {
        if (flaggedAtCreate) fd.set("flagged", "true");
        await createEntry(fd);
      }
    });
  }

  const micRecording = recorder.phase === "recording";
  const micBusy =
    recorder.phase === "transcribing" || recorder.phase === "requesting";
  const charsRemaining = MAX_ENTRY_CONTENT_CHARS - content.length;
  const showSoftWarning =
    content.length > SOFT_ENTRY_CONTENT_CHARS &&
    content.length < MAX_ENTRY_CONTENT_CHARS;

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="entry-title"
          className="text-xs uppercase tracking-wide text-neutral-500"
        >
          Title (optional)
        </label>
        <input
          id="entry-title"
          name="title"
          type="text"
          maxLength={MAX_ENTRY_TITLE_CHARS}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Leave blank to use the date"
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-brand-primary/50 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="entry-content"
            className="text-xs uppercase tracking-wide text-neutral-500"
          >
            What&apos;s on your mind?
          </label>
          <span
            className={
              "text-[11px] " +
              (charsRemaining < 0
                ? "text-red-400"
                : showSoftWarning
                ? "text-amber-300/80"
                : "text-neutral-500")
            }
          >
            {content.length.toLocaleString()} / {MAX_ENTRY_CONTENT_CHARS.toLocaleString()}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          id="entry-content"
          name="content"
          rows={6}
          maxLength={MAX_ENTRY_CONTENT_CHARS}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type or tap the mic to speak..."
          className="min-h-[10rem] resize-none whitespace-pre-wrap rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-white placeholder:text-neutral-500 focus:border-brand-primary/50 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={micBusy}
            aria-pressed={micRecording}
            className={
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 " +
              (micRecording
                ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                : "bg-white/5 text-neutral-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white")
            }
          >
            <MicGlyph recording={micRecording} />
            <span>{micButtonLabel(recorder.phase)}</span>
            {micRecording ? (
              <span className="tabular-nums text-[11px] text-red-200/80">
                {formatRecordingTime(recorder.recordingMs)}
              </span>
            ) : null}
          </button>
          {recorder.errorMessage ? (
            <p className="text-right text-[11px] text-red-300">
              {recorder.errorMessage}
            </p>
          ) : null}
        </div>
      </div>

      {!isEdit ? (
        <label className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
          <input
            type="checkbox"
            checked={flaggedAtCreate}
            onChange={(e) => setFlaggedAtCreate(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-primary"
          />
          <span className="text-sm text-neutral-300">
            <span className="font-medium text-white">Flag for next session.</span>{" "}
            Pre-select this entry to share with the coach when you start your
            next session.
          </span>
        </label>
      ) : null}

      {submitError ? (
        <p className="text-sm text-red-300">{submitError}</p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={pending || content.trim().length === 0}
          className="flex items-center gap-2 rounded-full bg-brand-primary px-6 py-2.5 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? (
            <>
              <PendingDots
                sizeClass="h-1.5 w-1.5"
                colorClass="bg-brand-primary-contrast"
                ariaLabel="Saving"
              />
              <span>Saving</span>
            </>
          ) : (
            <span>{isEdit ? "Save changes" : "Save entry"}</span>
          )}
        </button>
      </div>
    </form>
  );
}

function micButtonLabel(phase: RecordingPhase): string {
  switch (phase) {
    case "requesting":
      return "Requesting mic…";
    case "recording":
      return "Stop";
    case "transcribing":
      return "Transcribing…";
    case "error":
      return "Try again";
    default:
      return "Speak";
  }
}

function formatRecordingTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function MicGlyph({ recording }: { recording: boolean }) {
  if (recording) {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-400"
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-3.5 w-3.5"
    >
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}

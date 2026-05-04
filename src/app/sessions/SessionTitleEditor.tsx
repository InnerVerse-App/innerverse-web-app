"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { renameSession } from "./actions";

const MAX_CHARS = 200;

type Props = {
  sessionId: string;
  // What's currently being shown as the title (could be the user-set
  // override OR the auto-generated fallback). The textarea pre-fills
  // with the user's existing override only — passed separately so a
  // freshly-opened editor on a never-renamed session starts blank.
  displayedTitle: string;
  initialUserTitle: string | null;
};

export function SessionTitleEditor({
  sessionId,
  displayedTitle,
  initialUserTitle,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(initialUserTitle ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus + auto-grow when entering edit mode. Selecting all
  // makes "rename in place" feel intentional (typing replaces the
  // existing title rather than appending).
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  function handleSave() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await renameSession(sessionId, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleCancel() {
    if (pending) return;
    setDraft(initialUserTitle ?? "");
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 flex-1 text-base font-semibold leading-snug text-white">
          {displayedTitle}
        </p>
        <button
          type="button"
          onClick={(e) => {
            // Don't toggle the parent <details> when tapping the
            // pencil — the edit UI lives inside the <summary>.
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }}
          aria-label="Edit session title"
          className="mt-0.5 shrink-0 rounded-md p-1 text-neutral-500 transition hover:bg-white/5 hover:text-white"
        >
          <PencilIcon />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          // Auto-grow as the user types.
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
          }
        }}
        maxLength={MAX_CHARS}
        rows={1}
        placeholder="Title"
        className="w-full min-w-0 resize-none rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-base font-semibold leading-snug text-white placeholder:text-neutral-500 focus:border-brand-primary/50 focus:outline-none"
      />
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-full bg-brand-primary px-3 py-1 font-medium text-brand-primary-contrast transition hover:bg-brand-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded-full border border-white/10 px-3 py-1 text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
        >
          Cancel
        </button>
        {initialUserTitle ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              // Submit with empty draft to clear the override.
              startTransition(async () => {
                const result = await renameSession(sessionId, "");
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEditing(false);
              });
            }}
            disabled={pending}
            className="ml-auto text-neutral-500 underline-offset-4 transition hover:text-neutral-200 hover:underline disabled:opacity-50"
          >
            Reset to auto
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

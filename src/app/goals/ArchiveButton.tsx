"use client";

import { archiveGoal } from "./actions";

export function ArchiveButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={archiveGoal}
      onSubmit={(e) => {
        if (!confirm(`Archive "${title}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`Archive ${title}`}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition hover:border-amber-400/40 hover:text-amber-300"
      >
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
          <rect x="3" y="3" width="18" height="5" rx="1" />
          <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
          <line x1="10" y1="13" x2="14" y2="13" />
        </svg>
      </button>
    </form>
  );
}

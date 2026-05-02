"use client";

import { useTransition } from "react";

import { toggleFlag } from "../actions";

// Prominent toggle on the entry detail page. The list-row variant
// (JournalEntryListItem) uses a star icon; this one is labeled.
export function EntryFlagToggle({
  entryId,
  flagged,
}: {
  entryId: string;
  flagged: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", entryId);
      fd.set("flagged", flagged ? "false" : "true");
      await toggleFlag(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={flagged}
      className={
        "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 " +
        (flagged
          ? "border-amber-300/40 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
          : "border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white")
      }
    >
      <span className="text-base" aria-hidden>
        {flagged ? "★" : "☆"}
      </span>
      <span>
        {flagged ? "Flagged for next session" : "Flag for next session"}
      </span>
    </button>
  );
}

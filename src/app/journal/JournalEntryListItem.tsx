"use client";

import Link from "next/link";
import { useTransition } from "react";

import { formatDateTimeLong } from "@/lib/format";
import type { JournalEntry } from "@/lib/journal";

import { toggleFlag } from "./actions";

// Single row in the journal list. The star button sits outside the
// entry <Link> so tapping it doesn't navigate to the detail page.
export function JournalEntryListItem({ entry }: { entry: JournalEntry }) {
  const [pending, startTransition] = useTransition();

  function handleStarClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", entry.id);
      fd.set("flagged", entry.flagged_for_session ? "false" : "true");
      await toggleFlag(fd);
    });
  }

  const timestamp = formatDateTimeLong(entry.created_at);
  const headline = entry.title?.trim() || timestamp;
  const subhead = entry.title?.trim() ? timestamp : null;

  return (
    <div className="relative flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.02] transition hover:border-brand-primary/40 hover:bg-white/5">
      <Link
        href={`/journal/${entry.id}`}
        className="flex-1 min-w-0 rounded-md p-4"
      >
        <p className="truncate text-sm font-medium text-white">{headline}</p>
        {subhead ? (
          <p className="mt-0.5 text-[11px] text-neutral-500">{subhead}</p>
        ) : null}
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-neutral-400">
          {entry.content}
        </p>
      </Link>
      <button
        type="button"
        onClick={handleStarClick}
        disabled={pending}
        aria-label={
          entry.flagged_for_session
            ? "Unflag this entry"
            : "Flag this entry for next session"
        }
        aria-pressed={entry.flagged_for_session}
        className={
          "shrink-0 self-stretch rounded-md px-3 transition hover:bg-white/5 disabled:opacity-50 " +
          (entry.flagged_for_session
            ? "text-amber-300"
            : "text-neutral-500 hover:text-white")
        }
      >
        <span className="text-xl" aria-hidden>
          {entry.flagged_for_session ? "★" : "☆"}
        </span>
      </button>
    </div>
  );
}

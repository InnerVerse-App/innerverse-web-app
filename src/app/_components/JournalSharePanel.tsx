"use client";

import { useMemo, useState } from "react";

import { formatDateTimeCompact } from "@/lib/format";
import type { JournalEntry } from "@/lib/journal";

// Entry picker shown when the user picks "Bring something from my
// journal" as a session focus. Flagged entries are pre-selected.
// User must pick at least one entry to continue, or use Back to
// return to the focus picker and choose differently.
type Props = {
  entries: JournalEntry[];
  onContinue: (selectedIds: string[]) => void;
  onBack: () => void;
};

export function JournalSharePanel({ entries, onContinue, onBack }: Props) {
  const initialSelected = useMemo(
    () => new Set(entries.filter((e) => e.flagged_for_session).map((e) => e.id)),
    [entries],
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  function toggleEntry(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const flaggedCount = entries.filter((e) => e.flagged_for_session).length;
  const headerSubtext =
    flaggedCount > 0
      ? `${flaggedCount} starred ${flaggedCount === 1 ? "entry" : "entries"} pre-selected. Add or remove anything before continuing.`
      : "Pick at least one entry to bring into this session.";

  const canContinue = selected.size > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-white"
        >
          ← Back
        </button>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Pick what to share
        </p>
        <span className="w-12" aria-hidden />
      </div>
      <p className="px-1 text-xs text-neutral-400">{headerSubtext}</p>

      <div className="max-h-[24rem] overflow-y-auto rounded-md border border-white/10 bg-white/[0.02]">
        <ul className="flex flex-col divide-y divide-white/5">
          {entries.map((entry) => {
            const isSelected = selected.has(entry.id);
            const headline = entry.title?.trim() ||
              formatDateTimeCompact(entry.created_at);
            const subline = entry.title?.trim()
              ? formatDateTimeCompact(entry.created_at)
              : null;
            return (
              <li key={entry.id}>
                <label
                  className={
                    "flex cursor-pointer items-start gap-3 px-3 py-3 transition hover:bg-white/5 " +
                    (isSelected ? "bg-white/[0.03]" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleEntry(entry.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">
                        {headline}
                      </p>
                      {entry.flagged_for_session ? (
                        <span
                          className="text-xs text-amber-300"
                          aria-label="This entry was starred for next session"
                          title="Starred for next session"
                        >
                          ★
                        </span>
                      ) : null}
                    </div>
                    {subline ? (
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {subline}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-neutral-400">
                      {entry.content}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-1 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => onContinue(Array.from(selected))}
          disabled={!canContinue}
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canContinue
            ? `Continue with ${selected.size} ${selected.size === 1 ? "entry" : "entries"}`
            : "Pick an entry to continue"}
        </button>
      </div>
    </div>
  );
}

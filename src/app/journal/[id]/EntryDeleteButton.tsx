"use client";

import { useState, useTransition } from "react";

import { deleteEntry } from "../actions";

// Two-tap delete: first tap arms, second tap commits. Auto-disarms
// after 4s so a stray tap doesn't leave the button hot.
export function EntryDeleteButton({ entryId }: { entryId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 4_000);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", entryId);
      await deleteEntry(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        "rounded px-2 py-1 text-xs transition disabled:opacity-50 " +
        (confirming
          ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/20"
          : "text-neutral-500 hover:bg-white/5 hover:text-red-300")
      }
    >
      {pending ? "Deleting…" : confirming ? "Tap again to delete" : "Delete"}
    </button>
  );
}

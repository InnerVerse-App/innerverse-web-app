"use client";

import { useEffect, useRef, useState } from "react";

// Small inline pencil-and-input affordance shown below the
// constellation pill row when a constellation is selected. Surfaces
// to the user that constellation names are editable.
//
// V.1 BEHAVIOR: rename updates local state only — no server roundtrip
// because the constellation_name column doesn't exist yet. Save just
// closes the editor with the new name visible until refresh. The
// V.5a schema chunk will:
//   1. Add `breakthroughs.constellation_name text` column.
//   2. Populate it via the LLM session-end prompt.
//   3. Add a `renameConstellation(breakthroughId, name)` server
//      action with the standard auth/onboarding/RLS prelude.
//   4. Wire that server action into onSave below.

type Props = {
  breakthroughId: string;
  initialName: string;
};

export function ConstellationRename({ breakthroughId, initialName }: Props) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when the user switches to a different constellation.
  useEffect(() => {
    setName(initialName);
    setEditing(false);
  }, [breakthroughId, initialName]);

  // Auto-focus the input when entering edit mode.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    // V.5a: call renameConstellation(breakthroughId, name) server action.
  }

  function cancel() {
    setName(initialName);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          maxLength={60}
          className="flex-1 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-brand-primary/60 focus:bg-white/10"
          aria-label="Constellation name"
        />
        <button
          type="button"
          onClick={commit}
          className="rounded-md border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary transition hover:bg-brand-primary/20"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-400 transition hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      <span className="font-medium text-white">{name}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename this constellation"
        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-400 transition hover:border-brand-primary/30 hover:text-brand-primary"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        Rename
      </button>
    </div>
  );
}

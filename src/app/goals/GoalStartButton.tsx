"use client";

import { useState, useTransition } from "react";

import { PendingDots } from "@/app/_components/PendingDots";
import { StartSessionModePicker } from "@/app/_components/StartSessionModePicker";
import { startSession } from "@/app/sessions/actions";

// Per-goal "Start a session for this goal" CTA on each GoalCard.
// The user already chose what they want to work on by tapping this
// button — no journal-share step here, by design (journal entries
// only reach a session via the home page's "Bring something from
// my journal" focus path).
export function GoalStartButton({ goalId }: { goalId: string }) {
  const [showModePicker, setShowModePicker] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmMode(mode: "text" | "voice") {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("focus_kind", "goal");
      fd.set("focus_id", goalId);
      fd.set("focus_mode", mode);
      await startSession(fd);
    });
  }

  if (pending) {
    return (
      <div className="mt-4 flex items-center justify-center gap-3 border-t border-white/5 pt-4 text-sm text-brand-primary">
        <PendingDots
          sizeClass="h-1.5 w-1.5"
          colorClass="bg-brand-primary"
          ariaLabel="Starting your session"
        />
        <span>Starting your session</span>
      </div>
    );
  }

  if (showModePicker) {
    return (
      <div className="mt-4 border-t border-white/5 pt-4">
        <StartSessionModePicker
          onSelect={confirmMode}
          onBack={() => setShowModePicker(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <button
        type="button"
        onClick={() => setShowModePicker(true)}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-primary/40 bg-brand-primary/10 px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/20"
      >
        <span aria-hidden>⚡</span>
        Start a session for this goal
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { JournalSharePanel } from "@/app/_components/JournalSharePanel";
import { PendingDots } from "@/app/_components/PendingDots";
import { StartSessionModePicker } from "@/app/_components/StartSessionModePicker";
import { startSession } from "@/app/sessions/actions";
import type { JournalEntry } from "@/lib/journal";

// Per-goal "Start a session for this goal" CTA used inside the
// server-rendered GoalCard. Lives in a client component because we
// need to show the mode picker (Type / Talk) and journal-share step
// inline before firing the startSession server action.
//
// `journalEntries` is the user's full journal list (newest first).
// Pass empty when not preloaded — the share step is then skipped
// entirely. The same array can be passed to every GoalStartButton
// on the page; the data is user-level, not per-goal.
export function GoalStartButton({
  goalId,
  journalEntries,
}: {
  goalId: string;
  journalEntries: JournalEntry[];
}) {
  type Step = "closed" | "mode" | "journal-share";
  const [step, setStep] = useState<Step>("closed");
  const [pendingMode, setPendingMode] = useState<"text" | "voice" | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmMode(mode: "text" | "voice") {
    if (journalEntries.length > 0) {
      setPendingMode(mode);
      setStep("journal-share");
      return;
    }
    fireStartSession(mode, []);
  }

  function fireStartSession(
    mode: "text" | "voice",
    sharedJournalIds: string[],
  ) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("focus_kind", "goal");
      fd.set("focus_id", goalId);
      fd.set("focus_mode", mode);
      for (const id of sharedJournalIds) {
        fd.append("shared_journal_ids", id);
      }
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

  if (step === "journal-share") {
    return (
      <div className="mt-4 border-t border-white/5 pt-4">
        <JournalSharePanel
          entries={journalEntries}
          onBack={() => setStep("mode")}
          onSkip={() => {
            if (!pendingMode) return;
            fireStartSession(pendingMode, []);
          }}
          onContinue={(selectedIds) => {
            if (!pendingMode) return;
            fireStartSession(pendingMode, selectedIds);
          }}
        />
      </div>
    );
  }

  if (step === "mode") {
    return (
      <div className="mt-4 border-t border-white/5 pt-4">
        <StartSessionModePicker
          onSelect={confirmMode}
          onBack={() => setStep("closed")}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <button
        type="button"
        onClick={() => setStep("mode")}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-primary/40 bg-brand-primary/10 px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/20"
      >
        <span aria-hidden>⚡</span>
        Start a session for this goal
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { JournalSharePanel } from "@/app/_components/JournalSharePanel";
import { PendingDots } from "@/app/_components/PendingDots";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { StartSessionModePicker } from "@/app/_components/StartSessionModePicker";
import { startSession } from "@/app/sessions/actions";
import type { JournalEntry } from "@/lib/journal";

export type StartSessionGoal = {
  id: string;
  title: string;
  progress_percent: number | null;
};

type Props = {
  goals: StartSessionGoal[];
  // The user's full journal list (newest first). When non-empty, a
  // "Work on my journal" focus option appears in the picker AND a
  // post-mode share-step appears after any other focus choice. Pass
  // an empty array to disable both surfaces.
  journalEntries: JournalEntry[];
  buttonLabel: string;
};

type Focus = { kind: "goal"; id: string } | null;
// Two distinct contexts in which the journal-share panel can render:
//   "as-focus": user picked "Work on my journal" — the panel is the
//     focus selector, and mode pick happens AFTER it
//   "after-mode": user picked a goal or blank slate — the panel is
//     an optional add-on, and mode pick happened BEFORE it
// Tracked so the panel's Continue/Skip/Back wire to the right next
// step in each case.
type ShareContext = "as-focus" | "after-mode";

type Panel = "closed" | "options" | "goals" | "mode" | "journal-share";

export function StartSessionMenu({
  goals,
  journalEntries,
  buttonLabel,
}: Props) {
  const [panel, setPanel] = useState<Panel>("closed");
  const [pendingFocus, setPendingFocus] = useState<Focus>(null);
  const [pendingMode, setPendingMode] = useState<"text" | "voice" | null>(
    null,
  );
  const [pendingJournalIds, setPendingJournalIds] = useState<string[]>([]);
  const [shareContext, setShareContext] = useState<ShareContext>("after-mode");
  const [pending, startTransition] = useTransition();

  const hasJournalEntries = journalEntries.length > 0;

  function pickFocus(focus: Focus) {
    setPendingFocus(focus);
    setPanel("mode");
  }

  function pickJournalAsFocus() {
    setPendingFocus(null);
    setShareContext("as-focus");
    setPanel("journal-share");
  }

  // Mode picked. If user came via "Work on my journal" focus, the
  // journal-share panel already ran and we have the selected IDs;
  // fire the session. Otherwise, if they have any entries, route
  // through the post-mode share-step. Otherwise create immediately.
  function confirmMode(mode: "text" | "voice") {
    if (shareContext === "as-focus") {
      fireStartSession(mode, pendingJournalIds);
      return;
    }
    if (hasJournalEntries) {
      setPendingMode(mode);
      setShareContext("after-mode");
      setPanel("journal-share");
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
      if (pendingFocus) {
        fd.set("focus_kind", pendingFocus.kind);
        fd.set("focus_id", pendingFocus.id);
      }
      fd.set("focus_mode", mode);
      for (const id of sharedJournalIds) {
        fd.append("shared_journal_ids", id);
      }
      await startSession(fd);
    });
  }

  if (panel === "closed") {
    return (
      <button
        type="button"
        onClick={() => setPanel("options")}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 active:scale-[0.98]"
      >
        <span aria-hidden>⚡</span>
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      {pending ? (
        <div className="flex items-center justify-center gap-3 px-2 py-3 text-sm text-brand-primary">
          <PendingDots
            sizeClass="h-1.5 w-1.5"
            colorClass="bg-brand-primary"
            ariaLabel="Starting your session"
          />
          <span>Starting your session</span>
        </div>
      ) : panel === "options" ? (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs uppercase tracking-wide text-neutral-500">
            What would you like to focus on?
          </p>
          <OptionButton
            label="Work on my goals"
            sublabel={`${goals.length} goal${goals.length === 1 ? "" : "s"}`}
            onClick={() => setPanel("goals")}
          />
          {hasJournalEntries ? (
            <OptionButton
              label="Bring anything from your journal?"
              sublabel={`${journalEntries.length} ${journalEntries.length === 1 ? "entry" : "entries"} to choose from`}
              onClick={pickJournalAsFocus}
            />
          ) : null}
          <OptionButton
            label="I'm bringing something specific today"
            sublabel="Open the session with a blank slate"
            onClick={() => pickFocus(null)}
          />
          <button
            type="button"
            onClick={() => setPanel("closed")}
            className="mt-1 self-center rounded px-3 py-1 text-xs text-neutral-400 transition hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : panel === "goals" ? (
        <ListPanel
          title="Pick a goal"
          onBack={() => setPanel("options")}
          empty={goals.length === 0 ? "No active goals yet." : null}
        >
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => pickFocus({ kind: "goal", id: g.id })}
              className="block w-full rounded-md border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-brand-primary/40 hover:bg-white/5"
            >
              <p className="text-sm font-medium text-white">{g.title}</p>
              <ProgressBar percent={g.progress_percent ?? 0} />
            </button>
          ))}
        </ListPanel>
      ) : panel === "mode" ? (
        <StartSessionModePicker
          onSelect={confirmMode}
          onBack={() => {
            // Back from mode → return to whichever picker preceded
            // it. If the user came via the journal focus, that means
            // the journal-share panel was just before mode.
            if (shareContext === "as-focus") {
              setPanel("journal-share");
              return;
            }
            if (pendingFocus?.kind === "goal") setPanel("goals");
            else setPanel("options");
            setPendingFocus(null);
          }}
        />
      ) : (
        <JournalSharePanel
          entries={journalEntries}
          onBack={() => {
            if (shareContext === "as-focus") {
              // User came from the focus picker — go back to options.
              setPendingJournalIds([]);
              setShareContext("after-mode");
              setPanel("options");
              return;
            }
            // User came via the post-mode flow — back to mode pick.
            setPanel("mode");
          }}
          onSkip={() => {
            if (shareContext === "as-focus") {
              setPendingJournalIds([]);
              setPanel("mode");
              return;
            }
            if (!pendingMode) return;
            fireStartSession(pendingMode, []);
          }}
          onContinue={(selectedIds) => {
            if (shareContext === "as-focus") {
              setPendingJournalIds(selectedIds);
              setPanel("mode");
              return;
            }
            if (!pendingMode) return;
            fireStartSession(pendingMode, selectedIds);
          }}
        />
      )}
    </div>
  );
}

function OptionButton({
  label,
  sublabel,
  onClick,
}: {
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-brand-primary/40 hover:bg-white/[0.05]"
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="text-xs text-neutral-400">{sublabel}</span>
    </button>
  );
}

function ListPanel({
  title,
  onBack,
  empty,
  children,
}: {
  title: string;
  onBack: () => void;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:text-white"
        >
          ← Back
        </button>
        <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
        <span className="w-12" aria-hidden />
      </div>
      {empty ? (
        <p className="px-2 py-3 text-center text-xs text-neutral-500">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5">{children}</div>
      )}
    </div>
  );
}

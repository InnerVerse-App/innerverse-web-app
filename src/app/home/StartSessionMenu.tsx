"use client";

import { useState, useTransition } from "react";

import { PendingDots } from "@/app/_components/PendingDots";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { StartSessionModePicker } from "@/app/_components/StartSessionModePicker";
import { startSession } from "@/app/sessions/actions";

export type StartSessionGoal = {
  id: string;
  title: string;
  progress_percent: number | null;
};

type Props = {
  goals: StartSessionGoal[];
  buttonLabel: string;
};

type Focus = { kind: "goal"; id: string } | null;
// "mode" is the new step that appears AFTER the user picks a focus —
// they choose Type or Talk before the session is actually created.
type Panel = "closed" | "options" | "goals" | "mode";

export function StartSessionMenu({ goals, buttonLabel }: Props) {
  const [panel, setPanel] = useState<Panel>("closed");
  const [pendingFocus, setPendingFocus] = useState<Focus>(null);
  const [pending, startTransition] = useTransition();

  // First step: user picked a focus. Don't fire startSession yet —
  // stash the focus and advance to the mode picker.
  function pickFocus(focus: Focus) {
    setPendingFocus(focus);
    setPanel("mode");
  }

  // Second step: mode chosen. Now actually start the session.
  function confirmMode(mode: "text" | "voice") {
    startTransition(async () => {
      const fd = new FormData();
      if (pendingFocus) {
        fd.set("focus_kind", pendingFocus.kind);
        fd.set("focus_id", pendingFocus.id);
      }
      fd.set("focus_mode", mode);
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
      ) : (
        // panel === "mode" — final step, fires startSession on choice.
        <StartSessionModePicker
          onSelect={confirmMode}
          onBack={() => {
            // Back from mode → return to whichever picker preceded it.
            if (pendingFocus?.kind === "goal") setPanel("goals");
            else setPanel("options");
            setPendingFocus(null);
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

"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { saveStep4 } from "./actions";
import { COACH_NOTES_MAX } from "./data";

export function Step4Notes({ initialNotes }: { initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);

  return (
    <OnboardingShell
      step={4}
      title="Anything else you'd like your Coach to know?"
      subtitle="Share any additional context, challenges, or specific situations you'd like to work on. This is completely optional."
      canContinue={true}
      onContinue={() => saveStep4(notes)}
    >
      <div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, COACH_NOTES_MAX))}
          placeholder="For example: I'm going through a career transition, struggling with work-life balance, dealing with a specific relationship challenge, or working on a particular goal…"
          rows={6}
          className="w-full rounded-md border border-white/10 bg-white/[0.02] p-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-brand-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">
          {notes.length}/{COACH_NOTES_MAX} characters · This information helps
          personalize your coaching experience
        </p>
      </div>
    </OnboardingShell>
  );
}

"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { TipCallout } from "./TipCallout";
import { saveStep5 } from "./actions";
import { COACHES } from "./data";

export function Step5Coach({ initialCoach }: { initialCoach: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialCoach);

  return (
    <OnboardingShell
      step={5}
      title="Choose your coach"
      subtitle="Give your coach a name that resonates with you. Each name comes with its own personality style."
      continueLabel="Complete Setup"
      canContinue={selected !== null}
      onContinue={() => saveStep5(selected ?? "")}
    >
      <div className="space-y-2.5">
        {COACHES.map((coach) => {
          const isOn = selected === coach.value;
          return (
            <button
              key={coach.value}
              type="button"
              onClick={() => setSelected(coach.value)}
              aria-pressed={isOn}
              className={
                "block w-full rounded-lg border p-3.5 text-left transition " +
                (isOn
                  ? "border-brand-primary bg-brand-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5")
              }
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  {coach.label}
                </h3>
                {coach.recommended ? (
                  <span className="rounded-full bg-brand-primary/20 px-2 py-0.5 text-xs font-medium text-brand-primary">
                    Recommended
                  </span>
                ) : null}
                <span
                  className={
                    "ml-auto h-4 w-4 rounded-full border " +
                    (isOn ? "border-brand-primary bg-brand-primary" : "border-white/20")
                  }
                />
              </div>
              <p className="mt-1 text-sm text-neutral-300">
                {coach.description}
              </p>
            </button>
          );
        })}
        <TipCallout label="Remember">
          This is just a name and personality style. Your coach will always
          adapt to your needs and preferences.
        </TipCallout>
      </div>
    </OnboardingShell>
  );
}

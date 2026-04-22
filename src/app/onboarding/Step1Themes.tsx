"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { saveStep1 } from "./actions";
import { THEMES } from "./data";

export function Step1Themes({ initialSelected }: { initialSelected: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected),
  );

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <OnboardingShell
      step={1}
      title="Why are you here?"
      subtitle="Select all that resonate with you. This helps us understand your goals."
      canContinue={selected.size > 0}
      onContinue={() => saveStep1(Array.from(selected))}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {THEMES.map((theme) => {
          const isOn = selected.has(theme.value);
          return (
            <button
              key={theme.value}
              type="button"
              onClick={() => toggle(theme.value)}
              aria-pressed={isOn}
              className={
                "rounded-full border px-4 py-3 text-sm transition " +
                (isOn
                  ? "border-brand-primary bg-brand-primary/15 text-white"
                  : "border-white/10 bg-white/[0.02] text-neutral-200 hover:bg-white/5")
              }
            >
              {theme.label}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}

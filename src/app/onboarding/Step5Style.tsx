"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { saveStep5 } from "./actions";
import { COACHING_STYLES } from "./data";

export function Step5Style({ initialStyle }: { initialStyle: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialStyle);

  return (
    <OnboardingShell
      step={5}
      title="Choose your coaching style"
      subtitle="How would you like your coach to interact with you? You can always change this later."
      canContinue={selected !== null}
      onContinue={() => saveStep5(selected ?? "")}
    >
      <div className="space-y-3">
        {COACHING_STYLES.map((style) => {
          const isOn = selected === style.value;
          return (
            <button
              key={style.value}
              type="button"
              onClick={() => setSelected(style.value)}
              aria-pressed={isOn}
              className={
                "block w-full rounded-lg border p-4 text-left transition " +
                (isOn
                  ? "border-brand-primary bg-brand-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5")
              }
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  {style.label}
                </h3>
                {style.recommended ? (
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
                {style.description}
              </p>
              <div className="mt-3 rounded-md bg-white/5 p-3">
                <p className="text-xs text-neutral-400">Example question:</p>
                <p className="mt-1 text-sm italic text-neutral-200">
                  &ldquo;{style.exampleQuestion}&rdquo;
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}

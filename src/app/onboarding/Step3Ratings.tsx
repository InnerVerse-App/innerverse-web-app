"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { TipCallout } from "./TipCallout";
import { saveStep3 } from "./actions";
import {
  SATISFACTION_CATEGORIES,
  SATISFACTION_LABELS,
} from "./data";
import type { SatisfactionRatings } from "@/lib/onboarding";

export function Step3Ratings({
  initialRatings,
}: {
  initialRatings: SatisfactionRatings | null;
}) {
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const cat of SATISFACTION_CATEGORIES) {
      init[cat.key] = initialRatings?.[cat.key] ?? 3;
    }
    return init;
  });

  const setOne = (key: string, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <OnboardingShell
      step={3}
      title="Rate your current satisfaction"
      subtitle="How satisfied are you with these key areas of your life? (1 = Very Dissatisfied, 5 = Very Satisfied)"
      canContinue={true}
      onContinue={() => saveStep3(ratings)}
    >
      <div className="space-y-6">
        {SATISFACTION_CATEGORIES.map((cat) => {
          const value = ratings[cat.key] ?? 3;
          return (
            <div key={cat.key}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-white">
                  {cat.label}
                </h2>
                <div className="text-right">
                  <div className="text-lg font-semibold text-brand-alert">
                    {value}
                  </div>
                  <div className="text-xs text-brand-alert/80">
                    {SATISFACTION_LABELS[value]}
                  </div>
                </div>
              </div>
              <p className="mb-2 text-sm text-neutral-400">{cat.description}</p>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={value}
                onChange={(e) => setOne(cat.key, Number(e.target.value))}
                className="w-full accent-brand-primary"
                aria-label={`${cat.label} rating, currently ${value}`}
              />
              <div className="mt-1 flex justify-between text-xs text-neutral-500">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
          );
        })}
        <TipCallout label="Tip">
          These ratings help your coach understand which areas to focus on
          during your sessions. You can always update these later in your
          settings.
        </TipCallout>
      </div>
    </OnboardingShell>
  );
}

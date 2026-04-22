"use client";

import { useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { saveStep2 } from "./actions";
import { GOAL_CATEGORIES, TOP_GOALS_INPUT_MAX } from "./data";

type Props = {
  initialSelected: string[];
  initialFreeText: string;
};

export function Step2Goals({ initialSelected, initialFreeText }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected),
  );
  const [freeText, setFreeText] = useState(initialFreeText);

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
      step={2}
      title="What are your top goals?"
      subtitle="Choose the areas you'd most like to focus on in your coaching journey."
      canContinue={selected.size > 0}
      onContinue={() => saveStep2(Array.from(selected), freeText)}
    >
      <div className="space-y-5">
        {GOAL_CATEGORIES.map((cat) => (
          <section key={cat.name}>
            <h2 className="mb-2 text-sm font-semibold text-brand-primary">
              {cat.name}
            </h2>
            <div className="space-y-2">
              {cat.goals.map((goal) => {
                const isOn = selected.has(goal.value);
                return (
                  <button
                    key={goal.value}
                    type="button"
                    onClick={() => toggle(goal.value)}
                    aria-pressed={isOn}
                    className={
                      "block w-full rounded-full border px-4 py-2.5 text-sm transition " +
                      (isOn
                        ? "border-brand-primary bg-brand-primary/15 text-white"
                        : "border-white/10 bg-white/[0.02] text-neutral-200 hover:bg-white/5")
                    }
                  >
                    {goal.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-brand-primary">
            Not seeing what you&apos;re looking for?
          </h2>
          <textarea
            value={freeText}
            onChange={(e) =>
              setFreeText(e.target.value.slice(0, TOP_GOALS_INPUT_MAX))
            }
            placeholder="Type your goals here…"
            rows={4}
            className="w-full rounded-md border border-white/10 bg-white/[0.02] p-3 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-brand-primary focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-neutral-500">
            {freeText.length}/{TOP_GOALS_INPUT_MAX}
          </p>
        </section>
      </div>
    </OnboardingShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { TOTAL_STEPS } from "./data";
import type { ActionResult } from "./actions";

type Props = {
  step: number;
  title: string;
  subtitle?: string;
  // Caller decides what to send. Returning ok: false surfaces the
  // error string under the action bar.
  onContinue: () => Promise<ActionResult>;
  continueLabel?: string;
  canContinue: boolean;
  showBack?: boolean;
  children: ReactNode;
};

export function OnboardingShell({
  step,
  title,
  subtitle,
  onContinue,
  continueLabel = "Continue",
  canContinue,
  showBack = true,
  children,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    if (!canContinue || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await onContinue();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Always advance exactly one step. If a future step was already
      // completed in a prior session, the user can use Continue to walk
      // through it rather than being teleported past it. Step 6 sets
      // completed_at, after which the page redirects to /.
      router.push(`/onboarding?step=${step + 1}`);
    });
  };

  const handleBack = () => {
    if (step <= 1 || pending) return;
    router.push(`/onboarding?step=${step - 1}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <header className="border-b border-white/5 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="text-base font-semibold tracking-tight text-white">
            InnerVerse
          </div>
          <div className="text-xs text-neutral-400 sm:text-sm">
            Step {step} of {TOTAL_STEPS}
          </div>
        </div>
        <div className="mx-auto mt-2 h-1 max-w-2xl overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-brand-primary transition-[width] duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 sm:p-8">
            <h1 className="text-center text-2xl font-bold text-white sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-center text-sm text-neutral-400 sm:text-base">
                {subtitle}
              </p>
            ) : null}
            <div className="mt-6 sm:mt-8">{children}</div>
          </div>
          {error ? (
            <p className="mt-3 text-center text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </main>

      <footer className="border-t border-white/5 px-4 py-3 sm:px-8 sm:py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          {showBack && step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={pending}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue || pending}
            className="rounded-md bg-brand-primary px-5 py-2 text-sm font-medium text-brand-primary-contrast transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : continueLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

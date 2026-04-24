import Link from "next/link";

import { goalLabel } from "@/lib/onboarding-labels";

type Props = {
  topGoalRaw: string | null;
};

export function TopGoalCard({ topGoalRaw }: Props) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-brand-primary"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.25" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
        <h2 className="text-base font-semibold text-white">Top Goal</h2>
      </div>
      {topGoalRaw ? (
        <p className="mt-3 break-words text-sm text-neutral-200">
          {goalLabel(topGoalRaw)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          No goals yet.{" "}
          <Link
            href="/goals"
            className="text-brand-primary transition hover:opacity-80"
          >
            Set one
          </Link>
          .
        </p>
      )}
    </section>
  );
}

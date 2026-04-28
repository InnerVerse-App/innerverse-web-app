import Link from "next/link";

import { ProgressBar } from "@/app/_components/ProgressBar";
import type { ActiveGoal } from "@/lib/goals";
import { progressForGoal, progressToOpacity } from "@/lib/progress";

type Props = {
  topGoal: ActiveGoal | null;
  // Kept for backward compat with home/page.tsx call sites; no longer
  // read since the bar computes from the goal's own last_engaged_at.
  topGoalLastSessionEndedAt?: string | null;
};

// Glance view — Goals tab shows the full rationale.
const RATIONALE_HOME_MAX = 120;
const GOAL_COLOR = "#4ADE80";

export function TopGoalCard({ topGoal }: Props) {
  if (!topGoal) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <Header />
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
      </section>
    );
  }

  const computed = progressForGoal(
    topGoal.progress_percent,
    topGoal.last_engaged_at,
    topGoal.completion_type,
  );

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <Header />
      <div className="mt-3 flex items-start justify-between gap-2">
        <p className="break-words text-sm font-medium text-white">
          {topGoal.title}
        </p>
        {topGoal.completion_type === "milestone" ? (
          <span className="shrink-0 text-xs text-neutral-400">
            {Math.round(computed)}%
          </span>
        ) : null}
      </div>
      <ProgressBar
        percent={computed}
        color={GOAL_COLOR}
        opacity={
          topGoal.completion_type === "milestone"
            ? 1
            : progressToOpacity(computed)
        }
      />
      {topGoal.progress_rationale ? (
        <p className="mt-2 text-xs text-neutral-400">
          {topGoal.progress_rationale.length > RATIONALE_HOME_MAX
            ? topGoal.progress_rationale.slice(0, RATIONALE_HOME_MAX) + "…"
            : topGoal.progress_rationale}
        </p>
      ) : null}
    </section>
  );
}

function Header() {
  return (
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
  );
}

import { StreakBadge } from "./StreakBadge";

// Your Metrics card — three scalar figures the user can see at a glance:
// Sessions (lifetime count of completed sessions), Goals (from onboarding
// top_goals + optional free-text), Streak (consecutive local-calendar
// days with a session, capped by the 60-day window in HomePage's loader).
//
// Server-rendered for Sessions + Goals (stable for the request).
// Streak renders inside a small client component (StreakBadge) so it
// uses the user's browser timezone without requiring a users.timezone
// column.

type Props = {
  sessionCount: number;
  goalCount: number;
  endedTimestamps: string[];
};

export function YourMetricsCard({
  sessionCount,
  goalCount,
  endedTimestamps,
}: Props) {
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
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <h2 className="text-base font-semibold text-white">Your Metrics</h2>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-400">Sessions</dt>
        <dd className="text-right text-neutral-200">{sessionCount}</dd>
        <dt className="text-neutral-400">Goals</dt>
        <dd className="text-right text-neutral-200">{goalCount}</dd>
        <dt className="text-neutral-400">Streak</dt>
        <dd className="text-right">
          <StreakBadge endedTimestamps={endedTimestamps} />
        </dd>
      </dl>
    </section>
  );
}

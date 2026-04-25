import Link from "next/link";

// Top Goal card on Home — first active goal from public.goals (ordered
// by created_at desc, which loadActiveGoalsWithLazySeed enforces).
//
// As of G.3 the card now renders the richer shape from the canonical
// (homescreen-5): title, progress %, progress bar, truncated rationale.
// progress_percent is hidden when null (goal hasn't been touched by an
// analyzed session yet); rationale is hidden when null/empty.

type Props = {
  topGoal: {
    title: string;
    progress_percent: number | null;
    progress_rationale: string | null;
  } | null;
};

// Truncate the rationale shown on the narrow Home card. Goals tab shows
// the full rationale; this is a glance-view, so cap at 2 lines worth.
const RATIONALE_HOME_MAX = 120;

export function TopGoalCard({ topGoal }: Props) {
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
      {topGoal ? (
        <>
          <div className="mt-3 flex items-start justify-between gap-2">
            <p className="break-words text-sm font-medium text-white">
              {topGoal.title}
            </p>
            {topGoal.progress_percent !== null ? (
              <span className="shrink-0 text-xs text-neutral-400">
                {topGoal.progress_percent}%
              </span>
            ) : null}
          </div>
          {topGoal.progress_percent !== null ? (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-brand-primary"
                style={{ width: `${topGoal.progress_percent}%` }}
                aria-hidden
              />
            </div>
          ) : null}
          {topGoal.progress_rationale ? (
            <p className="mt-2 text-xs text-neutral-400">
              {topGoal.progress_rationale.length > RATIONALE_HOME_MAX
                ? topGoal.progress_rationale.slice(0, RATIONALE_HOME_MAX) + "…"
                : topGoal.progress_rationale}
            </p>
          ) : null}
        </>
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

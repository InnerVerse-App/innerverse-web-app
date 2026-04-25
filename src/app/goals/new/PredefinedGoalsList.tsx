import type { CatalogCategory, CatalogGoal } from "@/lib/goals";

import { addPredefinedGoal } from "./actions";

export function PredefinedGoalsList({
  categories,
}: {
  categories: CatalogCategory[];
}) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      {categories.map((cat) => (
        <section key={cat.name}>
          <h2 className="text-sm font-semibold text-brand-primary">
            {cat.name}
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {cat.goals.map((g) => (
              <GoalRow key={g.value} goal={g} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function GoalRow({ goal }: { goal: CatalogGoal }) {
  if (goal.state === "active") {
    return (
      <div
        className="flex items-center justify-between rounded-full border border-brand-primary/40 bg-brand-primary/10 px-4 py-2.5 text-sm text-white"
        aria-label={`${goal.label} — already added`}
      >
        <span>{goal.label}</span>
        <span className="flex items-center gap-1 text-xs text-brand-primary">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
          Added
        </span>
      </div>
    );
  }

  const isArchived = goal.state === "archived";

  return (
    <form action={addPredefinedGoal}>
      <input type="hidden" name="value" value={goal.value} />
      <button
        type="submit"
        className={
          isArchived
            ? "flex w-full items-center justify-between rounded-full border border-white/10 bg-white/[0.02] px-4 py-2.5 text-left text-sm text-neutral-400 transition hover:border-brand-primary/40 hover:text-white"
            : "flex w-full items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-sm text-white transition hover:border-brand-primary/40 hover:bg-white/[0.06]"
        }
      >
        <span className={isArchived ? "italic" : undefined}>{goal.label}</span>
        <span className="text-xs text-neutral-500">
          {isArchived ? "Re-add" : "+ Add"}
        </span>
      </button>
    </form>
  );
}

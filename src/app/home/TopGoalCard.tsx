import Link from "next/link";

import { goalLabel } from "@/lib/onboarding-labels";

// Top Goal card — minimal tile pending the Goals-tab build-out.
//
// Canonical design (app-screenshot-homescreen-5.jpeg, app-screenshot-
// goals-tab.PNG) shows a progress-percent bar and a per-goal rationale
// note. Neither exists in the schema today — the coaching_session_tables
// migration (20260422170000) explicitly defers goal-progress fields to
// "a future phase wires the Goals tab." This Chunk 4 ships the layout
// slot with title only so the 2-col grid matches canonical; Chunks
// after Goals-tab work will upgrade the card in place.
//
// If the user has no predefined top goals and no free-text goal, we
// render a placeholder that links to the Goals tab so the slot is
// still informative rather than blank.
//
// `topGoalRaw` is the raw onboarding value (snake_case for predefined
// options, plain text for the free-text input). goalLabel handles both
// — mapped values become their human label; unmapped values (including
// free-text) get humanized via sentence-case, which is a harmless
// identity for already-human strings.

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

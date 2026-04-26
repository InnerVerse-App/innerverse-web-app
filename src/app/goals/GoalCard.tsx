import Link from "next/link";

import { ProgressBar } from "@/app/_components/ProgressBar";
import { startSession } from "@/app/sessions/actions";
import { formatDateCompact } from "@/lib/format";
import type { ActiveGoal } from "@/lib/goals";

import { ArchiveButton } from "./ArchiveButton";

export type GoalCardData = Pick<
  ActiveGoal,
  | "id"
  | "title"
  | "status"
  | "progress_percent"
  | "progress_rationale"
  | "last_session_id"
  | "is_predefined"
> & {
  last_session_ended_at: string | null;
  current_next_step_content: string | null;
  current_next_step_done: boolean;
};

type Props = {
  goal: GoalCardData;
};

const STATUS_LABELS: Record<GoalCardData["status"], string | null> = {
  not_started: null,
  on_track: "On Track",
  at_risk: "At Risk",
};

const STATUS_PILL_CLASSES: Record<GoalCardData["status"], string> = {
  not_started: "",
  on_track: "border-brand-primary/40 bg-brand-primary/10 text-brand-primary",
  at_risk: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};

export function GoalCard({ goal }: Props) {
  const statusLabel = STATUS_LABELS[goal.status];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="break-words text-lg font-semibold text-white">
          {goal.title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {statusLabel ? (
            <span
              className={
                "rounded-full border px-3 py-1 text-xs font-medium " +
                STATUS_PILL_CLASSES[goal.status]
              }
            >
              {statusLabel}
            </span>
          ) : null}
          {goal.is_predefined ? null : (
            <Link
              href={`/goals/${goal.id}/edit`}
              aria-label={`Edit ${goal.title}`}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition hover:border-brand-primary/40 hover:text-brand-primary"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </Link>
          )}
          <ArchiveButton id={goal.id} title={goal.title} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-400">Progress</span>
          <span className="text-neutral-300">{goal.progress_percent ?? 0}%</span>
        </div>
        <ProgressBar percent={goal.progress_percent ?? 0} />
      </div>

      {goal.progress_rationale ? (
        <p className="mt-3 text-sm text-neutral-300">{goal.progress_rationale}</p>
      ) : null}

      {goal.last_session_id && goal.last_session_ended_at ? (
        <div className="mt-4 flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-neutral-500"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-xs text-neutral-400">
            Last session: {formatDateCompact(goal.last_session_ended_at)}
          </span>
          <Link
            href={`/sessions/${goal.last_session_id}`}
            className="ml-auto text-xs text-brand-primary transition hover:opacity-80"
          >
            View session
          </Link>
        </div>
      ) : null}

      {goal.current_next_step_content ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-amber-400"
              aria-hidden
            >
              <circle cx="12" cy="8" r="6" />
              <path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" />
            </svg>
            <h3 className="text-sm font-semibold text-white">
              Suggested Next Step
            </h3>
          </div>
          <p
            className={
              "mt-2 text-sm " +
              (goal.current_next_step_done
                ? "text-neutral-500 line-through"
                : "text-neutral-300")
            }
          >
            {goal.current_next_step_content}
          </p>
        </div>
      ) : null}

      <form action={startSession} className="mt-4 border-t border-white/5 pt-4">
        <input type="hidden" name="focus_kind" value="goal" />
        <input type="hidden" name="focus_id" value={goal.id} />
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-primary/40 bg-brand-primary/10 px-4 py-2 text-sm font-medium text-brand-primary transition hover:bg-brand-primary/20"
        >
          <span aria-hidden>⚡</span>
          Start a session for this goal
        </button>
      </form>
    </section>
  );
}

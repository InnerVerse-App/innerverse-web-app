"use client";

import { useTransition } from "react";

import { toggleNextStep } from "./actions";

// Single checklist row. useTransition keeps the button responsive
// while the server action round-trips (auth → RLS read → RLS
// update → revalidatePath). No optimistic UI — on a coaching-
// session cadence, users won't toggle fast enough to notice the
// ~200ms round-trip, and server authority keeps things simple.

type Props = {
  id: string;
  content: string;
  status: "pending" | "done";
};

export function NextStepRow({ id, content, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const isDone = status === "done";

  const handleToggle = () => {
    startTransition(async () => {
      await toggleNextStep(id, status);
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-pressed={isDone}
      className="flex w-full items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-brand-primary/40 disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className={
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
          (isDone
            ? "border-brand-primary bg-brand-primary"
            : "border-white/20")
        }
        aria-hidden
      >
        {isDone ? (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 text-brand-primary-contrast"
          >
            <polyline points="3 8 7 12 13 4" />
          </svg>
        ) : null}
      </span>
      <span
        className={
          "text-sm " +
          (isDone ? "text-neutral-500 line-through" : "text-neutral-200")
        }
      >
        {content}
      </span>
    </button>
  );
}

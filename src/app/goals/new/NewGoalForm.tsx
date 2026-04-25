"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { createGoal, type CreateGoalState } from "./actions";

const INITIAL_STATE: CreateGoalState = { error: null };

// Soft caps mirroring src/app/goals/new/actions.ts. Kept in the
// client component so the input attributes match the server-side
// validation; both should fail in the same way at the same length.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 disabled:opacity-70"
    >
      {pending ? "Saving…" : "Save goal"}
    </button>
  );
}

export function NewGoalForm() {
  const [state, formAction] = useFormState(createGoal, INITIAL_STATE);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white">Title</span>
        <input
          name="title"
          type="text"
          required
          maxLength={TITLE_MAX}
          autoFocus
          placeholder="e.g. Build steady morning routine"
          className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-brand-primary/60 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white">
          Description{" "}
          <span className="text-xs font-normal text-neutral-500">
            (optional)
          </span>
        </span>
        <textarea
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder="Why this matters to you. Helps your coach tailor the support."
          className="resize-y rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-brand-primary/60 focus:outline-none"
        />
      </label>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
        >
          {state.error}
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-3">
        <SubmitButton />
        <Link
          href="/goals"
          className="text-center text-sm text-neutral-400 transition hover:text-brand-primary"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

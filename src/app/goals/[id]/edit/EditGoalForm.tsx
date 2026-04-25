"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { DESCRIPTION_MAX, TITLE_MAX } from "@/app/goals/new/limits";

import { updateGoal, type UpdateGoalState } from "./actions";

const INITIAL_STATE: UpdateGoalState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 disabled:opacity-70"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function EditGoalForm({
  id,
  initialTitle,
  initialDescription,
}: {
  id: string;
  initialTitle: string;
  initialDescription: string;
}) {
  const [state, formAction] = useFormState(updateGoal, INITIAL_STATE);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white">Title</span>
        <input
          name="title"
          type="text"
          required
          maxLength={TITLE_MAX}
          autoFocus
          defaultValue={initialTitle}
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
          defaultValue={initialDescription}
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

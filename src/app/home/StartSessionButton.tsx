"use client";

import { useFormStatus } from "react-dom";

// useFormStatus is a client hook that reports the parent <form>'s
// submission state. Used here so the button can show a "Starting…"
// label during the server action's OpenAI round-trip (~3–5s).
export function StartSessionButton({
  label = "Start Your First Session",
}: {
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 disabled:opacity-70"
    >
      <span aria-hidden>{pending ? "…" : "⚡"}</span>
      {pending ? "Starting your session…" : label}
    </button>
  );
}

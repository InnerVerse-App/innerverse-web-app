"use client";

import { useFormStatus } from "react-dom";
import { acknowledgeDisclaimer } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-brand-primary px-5 py-3 text-sm font-medium text-brand-primary-contrast transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Saving…" : "I understand"}
    </button>
  );
}

export function Acknowledge() {
  return (
    <form action={acknowledgeDisclaimer}>
      <Submit />
    </form>
  );
}

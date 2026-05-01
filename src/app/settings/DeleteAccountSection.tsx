"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { deleteAccount } from "./actions";

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete my account permanently"}
    </button>
  );
}

export function DeleteAccountSection() {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  return (
    <section className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-5">
      <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
      <p className="mt-3 text-sm text-neutral-300">
        Permanently delete your account and all your data — sessions,
        messages, breakthroughs, mindset shifts, goals, and progress.
        This cannot be undone.
      </p>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
        >
          Delete my account
        </button>
      ) : (
        <form action={deleteAccount} className="mt-4 space-y-3">
          <p className="text-sm text-neutral-300">
            Type <span className="font-mono text-white">DELETE</span> to
            confirm:
          </p>
          <input
            type="text"
            name="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-500/40"
            placeholder="DELETE"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setConfirmation("");
              }}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
            <SubmitButton enabled={confirmation === "DELETE"} />
          </div>
        </form>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";

import { deleteAccount } from "./actions";

export function DeleteAccountSection() {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { signOut } = useClerk();

  function handleSubmit() {
    if (confirmation !== "DELETE" || pending) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("confirmation", confirmation);
      const result = await deleteAccount(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Clerk JWT cookies are still valid client-side until they
      // expire; without an explicit signOut the next request to /
      // would still resolve to the (now-deleted) userId, then bounce
      // into /onboarding because the public.users row is gone. Hand
      // the redirect to Clerk so it clears every session cookie
      // before navigating.
      await signOut({ redirectUrl: "/" });
    });
  }

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
        <div className="mt-4 space-y-3">
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
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setConfirmation("");
                setError(null);
              }}
              disabled={pending}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={confirmation !== "DELETE" || pending}
              className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete my account permanently"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

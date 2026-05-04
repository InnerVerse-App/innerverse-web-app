import Link from "next/link";

import { formatDateLong } from "@/lib/format";
import type { JournalEntry } from "@/lib/journal";

import { StartSessionMenu, type StartSessionGoal } from "./StartSessionMenu";

export type OpenSession = {
  id: string;
  started_at: string;
};

// Surfaced when the user has an open non-substantive session (resume
// window). Two paths offered:
//   * Continue → navigates to /sessions/[id], the existing chat view
//     loads with full message history and the user can keep typing.
//   * Start a new session (any focus path) → triggers startSession,
//     which auto-discards the open one before creating the new
//     row (see discardOpenNonSubstantiveSessions in lib/sessions.ts).
//     The card disappears on the next render because the new session
//     becomes the open one (which the user is now actively in).
//
// The single-open-at-a-time invariant means this card is either
// shown or hidden — never two at once.
export function OpenSessionCard({
  session,
  goals,
  journalEntries,
}: {
  session: OpenSession;
  goals: StartSessionGoal[];
  journalEntries: JournalEntry[];
}) {
  return (
    <section className="mt-6 rounded-xl border border-brand-primary/40 bg-brand-primary/[0.06] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-brand-primary"
          aria-hidden
        >
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Continue your session
        </h2>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        Started {formatDateLong(session.started_at)}
      </p>
      <p className="mt-3 text-sm text-neutral-300">
        You have a session in progress from earlier. Pick up where you left
        off, or start a new one — starting new will discard this one.
      </p>
      <Link
        href={`/sessions/${session.id}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 active:scale-[0.98]"
      >
        Continue session →
      </Link>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
          Or start a new session
        </p>
        <StartSessionMenu
          goals={goals}
          journalEntries={journalEntries}
          buttonLabel="Start a new session"
        />
      </div>
    </section>
  );
}

import Link from "next/link";

import { formatDateLong } from "@/lib/format";
import type { JournalEntry } from "@/lib/journal";

import { StartSessionMenu, type StartSessionGoal } from "./StartSessionMenu";

export type LastSession = {
  id: string;
  ended_at: string;
  summary: string | null;
  progress_summary_short: string | null;
  user_title: string | null;
  coach_message: string | null;
};

export function FirstSessionCard({
  coachLabelText,
  goals,
  journalEntries,
}: {
  coachLabelText: string;
  goals: StartSessionGoal[];
  journalEntries: JournalEntry[];
}) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-brand-primary"
          aria-hidden
        >
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Start Your First Session
        </h2>
      </div>
      <p className="mt-3 text-sm text-neutral-300">
        Begin your personalized coaching journey with{" "}
        <span className="font-medium text-white">{coachLabelText}</span>.
      </p>
      <p className="mt-3 text-sm text-neutral-300">
        Your coach is ready to help you explore your thoughts, set meaningful
        goals, and create lasting change.
      </p>
      <div className="mt-5">
        <StartSessionMenu
          goals={goals}
          journalEntries={journalEntries}
          buttonLabel="Start Your First Session"
        />
      </div>
    </section>
  );
}

export function LastSessionCard({
  session,
  goals,
  journalEntries,
}: {
  session: LastSession;
  goals: StartSessionGoal[];
  journalEntries: JournalEntry[];
}) {
  // The "(too short for analysis)" sentinel is the cron's marker for
  // sub-substantive ended sessions — render a friendlier label
  // rather than the raw DB string. user_title takes priority for
  // anything the user explicitly renamed.
  const summaryText =
    session.user_title ??
    (session.summary === "(too short for analysis)"
      ? "This session was too short to analyze."
      : (session.summary ?? session.progress_summary_short)) ??
    "Your previous session is still being analyzed — check back in a few minutes.";

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
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
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.25" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Last Coaching Session
        </h2>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        {formatDateLong(session.ended_at)}
      </p>
      <p className="mt-3 text-sm text-neutral-300">{summaryText}</p>
      <div className="mt-5">
        <StartSessionMenu
          goals={goals}
          journalEntries={journalEntries}
          buttonLabel="Start a New Session"
        />
      </div>
      <Link
        href={`/sessions/${session.id}`}
        className="mt-3 block text-center text-xs text-neutral-400 transition hover:text-brand-primary"
      >
        View session
      </Link>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { BottomNav } from "@/app/home/BottomNav";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SessionListRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  progress_summary_short: string | null;
};

async function loadSessionHistory(): Promise<SessionListRow[]> {
  const ctx = await supabaseForUser();
  if (!ctx) return [];
  const { data, error } = await ctx.client
    .from("sessions")
    .select("id, started_at, ended_at, summary, progress_summary_short")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data as SessionListRow[] | null) ?? [];
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function SessionsListPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const sessions = await loadSessionHistory();

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-white">Sessions</h1>
          <p className="mt-1 text-sm text-neutral-400">
            A log of your coaching sessions.
          </p>

          {sessions.length === 0 ? (
            <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-neutral-400">
              No sessions yet. Start one from the Home tab.
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    className="block rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-brand-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-neutral-400">
                        {formatSessionDate(s.started_at)}
                      </p>
                      <span
                        className={
                          s.ended_at
                            ? "text-[11px] text-neutral-500"
                            : "text-[11px] text-brand-primary"
                        }
                      >
                        {s.ended_at ? "Completed" : "In progress"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-neutral-200">
                      {s.summary ??
                        s.progress_summary_short ??
                        (s.ended_at
                          ? "Summary pending — analysis may still be running."
                          : "Open session — tap to continue.")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomNav active="sessions" />
    </div>
  );
}

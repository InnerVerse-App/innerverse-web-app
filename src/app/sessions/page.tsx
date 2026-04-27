import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  StartSessionMenu,
  type StartSessionGoal,
  type StartSessionShift,
} from "@/app/home/StartSessionMenu";
import { loadActiveGoalsWithLazySeed } from "@/lib/goals";
import { formatDateShort } from "@/lib/format";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Mirror of home/page.tsx — keep the menu's shift list scrollable
// rather than unbounded for chatty users.
const START_MENU_SHIFTS_LIMIT = 20;

type SessionListRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  progress_summary_short: string | null;
};

type EmptyStateData = {
  goals: StartSessionGoal[];
  shifts: StartSessionShift[];
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

async function loadEmptyStateMenuData(): Promise<EmptyStateData> {
  const ctx = await supabaseForUser();
  if (!ctx) return { goals: [], shifts: [] };
  const [goals, shiftsRes] = await Promise.all([
    loadActiveGoalsWithLazySeed(ctx),
    ctx.client
      .from("insights")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(START_MENU_SHIFTS_LIMIT),
  ]);
  if (shiftsRes.error) throw shiftsRes.error;
  return {
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      progress_percent: g.progress_percent,
    })),
    shifts: (shiftsRes.data ?? []) as StartSessionShift[],
  };
}

export default async function SessionsListPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const sessions = await loadSessionHistory();
  // Only fetch menu data when we'll actually render the empty state —
  // avoids the goals + insights round-trips for returning users.
  const emptyMenu =
    sessions.length === 0 ? await loadEmptyStateMenuData() : null;

  return (
    <PageShell active="sessions">
      <h1 className="text-3xl font-bold text-white">Sessions</h1>
      <p className="mt-1 text-sm text-neutral-400">
        A log of your coaching sessions.
      </p>

      {sessions.length === 0 && emptyMenu ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm text-neutral-400">
            No sessions yet. Begin your first coaching session to start
            building your log.
          </p>
          <div className="mt-4">
            <StartSessionMenu
              goals={emptyMenu.goals}
              shifts={emptyMenu.shifts}
              buttonLabel="Start Your First Session"
            />
          </div>
        </div>
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
                    {formatDateShort(s.started_at)}
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
    </PageShell>
  );
}

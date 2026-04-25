import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  type ActiveGoal,
  loadActiveGoalsWithLazySeed,
} from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { type GoalCardData, GoalCard } from "./GoalCard";

export const dynamic = "force-dynamic";

// Card-supporting data fetched once per Goals-tab render and merged
// into each goal client-side. Three RLS-scoped reads, all keyed off
// the user's own goals — no cross-user surface.

type SessionEndedRow = { id: string; ended_at: string | null };
type NextStepRow = {
  id: string;
  goal_id: string;
  content: string;
  status: "pending" | "done";
  created_at: string;
};

async function buildCardData(
  ctx: NonNullable<Awaited<ReturnType<typeof supabaseForUser>>>,
  activeGoals: ActiveGoal[],
): Promise<GoalCardData[]> {
  if (activeGoals.length === 0) return [];

  const goalIds = activeGoals.map((g) => g.id);
  const lastSessionIds = activeGoals
    .map((g) => g.last_session_id)
    .filter((x): x is string => !!x);

  const [stepsRes, sessionsRes] = await Promise.all([
    ctx.client
      .from("next_steps")
      .select("id, goal_id, content, status, created_at")
      .in("goal_id", goalIds)
      .order("created_at", { ascending: false }),
    lastSessionIds.length > 0
      ? ctx.client
          .from("sessions")
          .select("id, ended_at")
          .in("id", lastSessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stepsRes.error) throw stepsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  // Most-recent step per goal_id. Steps are pre-sorted DESC, so the
  // first one we see for a given goal is the latest.
  const latestStepByGoal = new Map<string, NextStepRow>();
  for (const row of (stepsRes.data ?? []) as NextStepRow[]) {
    if (!latestStepByGoal.has(row.goal_id)) {
      latestStepByGoal.set(row.goal_id, row);
    }
  }

  const sessionEndedById = new Map<string, string | null>(
    ((sessionsRes.data ?? []) as SessionEndedRow[]).map((r) => [r.id, r.ended_at]),
  );

  return activeGoals.map((g) => {
    const step = latestStepByGoal.get(g.id);
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      progress_percent: g.progress_percent,
      progress_rationale: g.progress_rationale,
      last_session_id: g.last_session_id,
      last_session_ended_at: g.last_session_id
        ? sessionEndedById.get(g.last_session_id) ?? null
        : null,
      current_next_step_content: step?.content ?? null,
      current_next_step_done: step?.status === "done",
      is_predefined: g.is_predefined,
    };
  });
}

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const activeGoals = await loadActiveGoalsWithLazySeed(ctx);
  const cards = await buildCardData(ctx, activeGoals);

  return (
    <PageShell active="goals">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Goals Progress</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Your personal growth development.
          </p>
        </div>
        {/* +Add button links to /goals/new which lands in G.4. Brief
            404 window between G.3 and G.4 deploys is acceptable —
            the placement matches the canonical and Vercel deploys
            them in sequence. */}
        <Link
          href="/goals/new"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-contrast shadow-md transition hover:bg-brand-primary/90"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-neutral-400">
          No goals yet. Tap{" "}
          <span className="font-medium text-white">Add</span> to set one, or
          start a coaching session and your coach will help surface goals as
          they emerge.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {cards.map((card) => (
            <li key={card.id}>
              <GoalCard goal={card} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

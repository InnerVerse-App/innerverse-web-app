import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { RecencyBar } from "@/app/_components/RecencyBar";
import { formatDateCompact } from "@/lib/format";
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

import { DEMO_GOALS } from "../progress/demo-data";

export const dynamic = "force-dynamic";

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

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  const isDemo = params.demo === "1";

  if (isDemo) {
    return (
      <PageShell active="goals" navHrefSuffix="?demo=1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">Goals Progress</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Your personal growth development.{" "}
              <span className="text-amber-400">(demo mode)</span>
            </p>
          </div>
        </div>
        <ul className="mt-6 flex flex-col gap-4">
          {DEMO_GOALS.map((g) => (
            <li
              key={g.id}
              id={`g-${g.id}`}
              className="scroll-mt-20 rounded-xl border border-white/10 bg-white/[0.02] p-5 target:border-brand-primary/40"
            >
              <h2 className="break-words text-lg font-semibold text-white">
                {g.title}
              </h2>
              {g.description ? (
                <p className="mt-2 text-sm text-neutral-400">{g.description}</p>
              ) : null}
              <div className="mt-4">
                {g.completionType === "milestone" ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-400">Progress</span>
                      <span className="text-neutral-300">
                        {g.progressPercent ?? 0}%
                      </span>
                    </div>
                    <ProgressBar percent={g.progressPercent ?? 0} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-400">Recent activity</span>
                      <span className="text-neutral-500 text-xs">
                        {g.lastEngagedAt
                          ? formatDateCompact(g.lastEngagedAt)
                          : "Not yet engaged"}
                      </span>
                    </div>
                    <RecencyBar
                      lastEngagedAt={g.lastEngagedAt}
                      color="#4ADE80"
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PageShell>
    );
  }

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
            <li
              key={card.id}
              id={`g-${card.id}`}
              className="scroll-mt-20 target:rounded-xl target:outline target:outline-1 target:outline-brand-primary/40"
            >
              <GoalCard goal={card} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

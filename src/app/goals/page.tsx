import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { AutoScrollToTarget } from "@/app/_components/AutoScrollToTarget";
import {
  type ExpandedDetail,
  ExpandedDetailBody,
} from "@/app/_components/ExpandedDetailBody";
import { PageShell } from "@/app/_components/PageShell";
import { CircularProgressRing } from "@/app/_components/CircularProgressRing";
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

import { buildDemoData, DEMO_GOALS, snippetFor } from "../progress/demo-data";

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
      completion_type: g.completion_type,
    };
  });
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; goal?: string }>;
}) {
  const params = await searchParams;
  const isDemo = params.demo === "1";
  const highlightedGoalId = params.goal ?? null;

  if (isDemo) {
    // Pull the full demo dataset so each goal card can build its
    // own ExpandedDetail (sessions + shifts + breakthroughs that
    // contributed to its progress).
    const demo = buildDemoData();
    const sessionById = new Map(
      demo.sessions.map((s) => [s.id, s] as const),
    );
    const shiftById = new Map(
      demo.mindsetShifts.map((m) => [m.id, m] as const),
    );
    const breakthroughById = new Map(
      demo.breakthroughs.map((b) => [b.id, b] as const),
    );

    function goalDetailFor(goalId: string): ExpandedDetail | null {
      const links = demo.goalLinks.get(goalId);
      if (!links) return null;
      const sessions = links.sessionIds
        .map((id) => sessionById.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({
          id: s.id,
          endedAt: s.endedAt,
          snippet: snippetFor(goalId, s.id, "session"),
        }))
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
      const shifts = links.shiftIds
        .map((id) => shiftById.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({
          id: m.id,
          content: m.content,
          snippet: snippetFor(goalId, m.id, "shift"),
        }));
      const breakthroughs = links.breakthroughIds
        .map((id) => breakthroughById.get(id))
        .filter((b): b is NonNullable<typeof b> => !!b)
        .map((b) => ({
          id: b.id,
          content: b.content,
          snippet: snippetFor(goalId, b.id, "breakthrough"),
        }));
      const totals = sessions.length + shifts.length + breakthroughs.length;
      const narrative =
        totals > 0
          ? `This goal has been shaped by ${sessions.length} session${sessions.length === 1 ? "" : "s"}, ${shifts.length} mindset shift${shifts.length === 1 ? "" : "s"}, and ${breakthroughs.length} breakthrough${breakthroughs.length === 1 ? "" : "s"}.`
          : "No engagement yet — your work on this will start to show up here once you mention it in a session.";
      return { narrative, sessions, shifts, breakthroughs };
    }

    return (
      <PageShell active="goals" navHrefSuffix="?demo=1">
        <AutoScrollToTarget
          targetId={highlightedGoalId ? `g-${highlightedGoalId}` : null}
        />
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
          {DEMO_GOALS.map((g) => {
            const detail = goalDetailFor(g.id);
            const starMapHref = `/progress?demo=1&goal=${g.id}#constellation-map`;
            const isHighlighted = highlightedGoalId === g.id;
            return (
              <li
                key={g.id}
                id={`g-${g.id}`}
                className={
                  "scroll-mt-20 rounded-xl border bg-white/[0.02] target:border-brand-primary target:bg-brand-primary/10 target:shadow-[0_0_18px_rgba(89,164,192,0.35)] " +
                  (isHighlighted
                    ? "border-brand-primary bg-brand-primary/10 shadow-[0_0_18px_rgba(89,164,192,0.35)]"
                    : "border-white/10")
                }
              >
                <details className="group" open={isHighlighted || undefined}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
                    <div className="flex-1">
                      {g.completionType === "milestone" ? (
                        <div className="flex items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <h2 className="break-words text-lg font-semibold text-white">
                              {g.title}
                            </h2>
                            {g.description ? (
                              <p className="mt-2 text-sm text-neutral-400">
                                {g.description}
                              </p>
                            ) : null}
                          </div>
                          <CircularProgressRing
                            percent={g.progressPercent ?? 0}
                          />
                        </div>
                      ) : (
                        <>
                          <h2 className="break-words text-lg font-semibold text-white">
                            {g.title}
                          </h2>
                          {g.description ? (
                            <p className="mt-2 text-sm text-neutral-400">
                              {g.description}
                            </p>
                          ) : null}
                        </>
                      )}
                      <div className="mt-4">
                        {g.completionType === "milestone" ? (
                          <ProgressBar
                            percent={g.progressPercent ?? 0}
                            variant="goal"
                          />
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-neutral-400">
                                Recent activity
                              </span>
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
                    </div>
                    <span
                      className="mt-1 inline-block shrink-0 text-neutral-500 transition group-open:rotate-180"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </summary>
                  <div className="border-t border-white/5 px-5 pb-5 pt-4">
                    {detail ? <ExpandedDetailBody detail={detail} /> : null}
                    <Link
                      href={starMapHref}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-[11px] font-medium text-brand-primary transition hover:bg-brand-primary/20"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="5.25" />
                        <circle cx="12" cy="12" r="1.5" />
                      </svg>
                      See on star map
                    </Link>
                  </div>
                </details>
              </li>
            );
          })}
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
      <AutoScrollToTarget
        targetId={highlightedGoalId ? `g-${highlightedGoalId}` : null}
      />
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
          {cards.map((card) => {
            const isHighlighted = highlightedGoalId === card.id;
            return (
              <li
                key={card.id}
                id={`g-${card.id}`}
                className={
                  "scroll-mt-20 rounded-xl transition " +
                  (isHighlighted
                    ? "outline outline-2 outline-brand-primary shadow-[0_0_18px_rgba(89,164,192,0.35)]"
                    : "")
                }
              >
                <GoalCard goal={card} />
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}

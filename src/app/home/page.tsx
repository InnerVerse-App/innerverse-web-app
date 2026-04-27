import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { type ActiveGoal, loadActiveGoalsWithLazySeed } from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { coachLabel } from "@/lib/onboarding-labels";
import { supabaseForUser } from "@/lib/supabase";

import {
  FirstSessionCard,
  LastSessionCard,
  type LastSession,
} from "./LastSessionCard";
import type {
  StartSessionGoal,
  StartSessionShift,
} from "./StartSessionMenu";
import { MessageFromCoachCard } from "./MessageFromCoachCard";
import {
  PersonalGrowthProgressCard,
  type RecentGrowthItem,
} from "./PersonalGrowthProgressCard";
import {
  RecentBreakthroughsCard,
  type RecentBreakthrough,
} from "./RecentBreakthroughsCard";
import { TopGoalCard } from "./TopGoalCard";
import { YourMetricsCard } from "./YourMetricsCard";

export const dynamic = "force-dynamic";

// Keeps the timestamp payload sent to StreakBadge bounded.
const STREAK_WINDOW_DAYS = 60;
const STREAK_WINDOW_ROW_CAP = 500;

// How many recent sessions the Personal Growth Progress card shows.
// Canonical (homescreen-4) shows 2 items; we allow up to 3 so the
// card fills out once the user has enough analyzed sessions.
const GROWTH_PROGRESS_LIMIT = 3;

// Recent Breakthroughs card cap — one row per breakthrough, newest
// first across all sessions. Matches canonical (homescreen-5 shows
// 2). Full history lives on the Progress tab.
const BREAKTHROUGHS_LIMIT = 3;

// Cap on how many recent mindset shifts the StartSessionMenu lists.
// Picks the freshest — older shifts fall off the picker but stay
// visible elsewhere. 20 keeps the sheet scrollable without becoming
// a wall.
const START_MENU_SHIFTS_LIMIT = 20;

type HomeData = {
  lastSession: LastSession | null;
  sessionCount: number;
  endedTimestamps: string[];
  recentGrowth: RecentGrowthItem[];
  recentBreakthroughs: RecentBreakthrough[];
  activeGoals: ActiveGoal[];
  recentShifts: StartSessionShift[];
};

type GrowthRow = {
  id: string;
  ended_at: string | null;
  progress_percent: number | null;
  progress_summary_short: string | null;
  breakthroughs: Array<{ content: string | null; note: string | null }>;
};

type BreakthroughRow = {
  id: string;
  content: string;
  note: string | null;
  created_at: string;
};

function buildGrowthItems(rows: GrowthRow[]): RecentGrowthItem[] {
  return rows
    .filter(
      (r): r is GrowthRow & { progress_percent: number } =>
        r.progress_percent !== null,
    )
    .map((r) => {
      const firstBreakthrough = r.breakthroughs[0];
      const title =
        firstBreakthrough?.content?.trim() ||
        r.progress_summary_short?.trim() ||
        "Growth session";
      const note = firstBreakthrough?.note?.trim() || null;
      return {
        sessionId: r.id,
        progressPercent: r.progress_percent,
        title,
        note,
      };
    });
}

// Six parallel Supabase reads. All are RLS-scoped so the
// supabaseForUser context is required; an unauthenticated caller
// short-circuits to empty counts (though HomePage's auth gate above
// should prevent that).
async function loadHomeData(): Promise<HomeData> {
  const ctx = await supabaseForUser();
  if (!ctx) {
    return {
      lastSession: null,
      sessionCount: 0,
      endedTimestamps: [],
      recentGrowth: [],
      recentBreakthroughs: [],
      activeGoals: [],
      recentShifts: [],
    };
  }

  const streakWindowIso = new Date(
    Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    lastRes,
    countRes,
    tsRes,
    growthRes,
    breakthroughsRes,
    activeGoals,
    shiftsRes,
  ] = await Promise.all([
    ctx.client
      .from("sessions")
      .select(
        "id, ended_at, summary, progress_summary_short, coach_message",
      )
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.client
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null),
    ctx.client
      .from("sessions")
      .select("ended_at")
      .not("ended_at", "is", null)
      .gte("ended_at", streakWindowIso)
      .order("ended_at", { ascending: false })
      .limit(STREAK_WINDOW_ROW_CAP),
    ctx.client
      .from("sessions")
      .select(
        "id, ended_at, progress_percent, progress_summary_short, breakthroughs(content, note)",
      )
      .not("ended_at", "is", null)
      .not("progress_percent", "is", null)
      .order("ended_at", { ascending: false })
      .order("created_at", {
        ascending: true,
        referencedTable: "breakthroughs",
      })
      .limit(1, { referencedTable: "breakthroughs" })
      .limit(GROWTH_PROGRESS_LIMIT),
    ctx.client
      .from("breakthroughs")
      .select("id, content, note, created_at")
      .order("created_at", { ascending: false })
      .limit(BREAKTHROUGHS_LIMIT),
    loadActiveGoalsWithLazySeed(ctx),
    ctx.client
      .from("insights")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(START_MENU_SHIFTS_LIMIT),
  ]);

  if (lastRes.error) throw lastRes.error;
  if (countRes.error) throw countRes.error;
  if (tsRes.error) throw tsRes.error;
  if (growthRes.error) throw growthRes.error;
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (shiftsRes.error) throw shiftsRes.error;

  const timestampRows = (tsRes.data ?? []) as Array<{
    ended_at: string | null;
  }>;

  const breakthroughRows = (breakthroughsRes.data ?? []) as BreakthroughRow[];

  return {
    lastSession: (lastRes.data as LastSession | null) ?? null,
    sessionCount: countRes.count ?? 0,
    endedTimestamps: timestampRows
      .map((r) => r.ended_at)
      .filter((x): x is string => !!x),
    recentGrowth: buildGrowthItems((growthRes.data ?? []) as GrowthRow[]),
    recentBreakthroughs: breakthroughRows.map((b) => ({
      id: b.id,
      content: b.content,
      note: b.note,
      createdAt: b.created_at,
    })),
    activeGoals,
    recentShifts: (shiftsRes.data ?? []) as StartSessionShift[],
  };
}

function activeGoalsForMenu(goals: ActiveGoal[]): StartSessionGoal[] {
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    progress_percent: g.progress_percent,
  }));
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (!isOnboardingComplete(state)) {
    redirect("/onboarding");
  }

  const coach = coachLabel(state?.coach_name);
  const {
    lastSession,
    sessionCount,
    endedTimestamps,
    recentGrowth,
    recentBreakthroughs,
    activeGoals,
    recentShifts,
  } = await loadHomeData();
  const goalCount = activeGoals.length;
  const topGoal = activeGoals[0] ?? null;
  const menuGoals = activeGoalsForMenu(activeGoals);

  return (
    <PageShell active="home">
      <h1 className="text-3xl font-bold text-white sm:text-4xl">
        Welcome to InnerVerse
      </h1>
      <p className="mt-1 text-sm text-neutral-400 sm:text-base">
        Ready to start your growth journey?
      </p>

      {lastSession ? (
        <LastSessionCard
          session={lastSession}
          goals={menuGoals}
          shifts={recentShifts}
        />
      ) : (
        <FirstSessionCard
          coachLabelText={coach}
          goals={menuGoals}
          shifts={recentShifts}
        />
      )}

      {/* Stays 2-col on narrow mobile per the Bubble design — cards
          are compact enough to read at phone width. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <YourMetricsCard
          sessionCount={sessionCount}
          goalCount={goalCount}
          endedTimestamps={endedTimestamps}
        />
        <TopGoalCard topGoal={topGoal} />
      </div>

      <PersonalGrowthProgressCard items={recentGrowth} />
      <RecentBreakthroughsCard items={recentBreakthroughs} />
      {lastSession?.coach_message ? (
        <MessageFromCoachCard message={lastSession.coach_message} />
      ) : null}
    </PageShell>
  );
}

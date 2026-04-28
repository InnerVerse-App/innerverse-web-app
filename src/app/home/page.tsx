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

import { DEMO_SESSIONS_LIST, DEMO_GOALS } from "../progress/demo-data";

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
    .filter((r): r is GrowthRow & { ended_at: string } => !!r.ended_at)
    .map((r) => {
      const firstBreakthrough = r.breakthroughs[0];
      const title =
        firstBreakthrough?.content?.trim() ||
        r.progress_summary_short?.trim() ||
        "Growth session";
      const note = firstBreakthrough?.note?.trim() || null;
      return {
        sessionId: r.id,
        endedAt: r.ended_at,
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  const isDemo = params.demo === "1";

  let coach = "your coach";
  let lastSession: LastSession | null = null;
  let sessionCount = 0;
  let endedTimestamps: string[] = [];
  let recentGrowth: RecentGrowthItem[] = [];
  let recentBreakthroughs: RecentBreakthrough[] = [];
  let activeGoals: ActiveGoal[] = [];
  let recentShifts: StartSessionShift[] = [];

  if (isDemo) {
    coach = "Maya";
    const latest = DEMO_SESSIONS_LIST[0];
    lastSession = {
      id: latest.id,
      ended_at: latest.ended_at,
      summary: latest.summary,
      progress_summary_short: latest.progress_summary_short,
      coach_message:
        "You're not waiting for permission anymore — you're choosing fit. Keep noticing the felt difference; that's the muscle.",
    };
    sessionCount = DEMO_SESSIONS_LIST.length;
    endedTimestamps = DEMO_SESSIONS_LIST.map((s) => s.ended_at);
    recentGrowth = [
      {
        sessionId: "demo-s6",
        endedAt: latest.ended_at,
        title: "Greater clarity in own decision-making",
        note: "Recognized that time in nature is the felt marker of a meaningful day.",
      },
      {
        sessionId: "demo-s4",
        endedAt: DEMO_SESSIONS_LIST[2].ended_at,
        title: "Distinguishing harm from discomfort",
        note: "Moved from preventing all upset to honoring explicit commitments.",
      },
      {
        sessionId: "demo-s2",
        endedAt: DEMO_SESSIONS_LIST[4].ended_at,
        title: "Named the fear behind negative feedback",
        note: "Held a balanced interpretation instead of collapsing into shame.",
      },
    ];
    recentBreakthroughs = [
      {
        id: "demo-b4",
        content: "Greater clarity in own decision-making",
        note: "Felt sense as the marker of meaningful direction.",
        createdAt: latest.ended_at,
      },
      {
        id: "demo-b2",
        content: "Distinguishing harm from discomfort",
        note: "Honoring commitments while allowing others their feelings.",
        createdAt: DEMO_SESSIONS_LIST[2].ended_at,
      },
      {
        id: "demo-b1",
        content: "Named the fear behind negative feedback",
        note: "Loss of belonging — and that it's survivable.",
        createdAt: DEMO_SESSIONS_LIST[4].ended_at,
      },
    ];
    activeGoals = DEMO_GOALS.filter(
      (g) => g.completionType === "milestone" || g.lastEngagedAt,
    ).map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      status: "on_track",
      progress_percent: g.progressPercent,
      progress_rationale: null,
      last_session_id: g.lastEngagedAt ? "demo-s6" : null,
      is_predefined: g.completionType === "practice",
      completion_type: g.completionType,
    }));
    // Demo-mode start-session menu: leave shifts empty so the
    // mindset-shift option auto-hides per the menu's own spec.
    recentShifts = [];
  } else {
    const session = await auth();
    if (!session?.userId) {
      redirect("/sign-in");
    }

    const state = await getOnboardingState();
    if (!isOnboardingComplete(state)) {
      redirect("/onboarding");
    }

    coach = coachLabel(state?.coach_name);
    const homeData = await loadHomeData();
    lastSession = homeData.lastSession;
    sessionCount = homeData.sessionCount;
    endedTimestamps = homeData.endedTimestamps;
    recentGrowth = homeData.recentGrowth;
    recentBreakthroughs = homeData.recentBreakthroughs;
    activeGoals = homeData.activeGoals;
    recentShifts = homeData.recentShifts;
  }

  const goalCount = activeGoals.length;
  const topGoal = activeGoals[0] ?? null;
  const menuGoals = activeGoalsForMenu(activeGoals);

  // Resolve the top goal's last_session_ended_at for the practice-type
  // recency bar on TopGoalCard. Null when there's no top goal, no last
  // session id on the goal, or the lookup fails.
  let topGoalLastSessionEndedAt: string | null = null;
  // Cumulative growth narrative — read from coaching_state if the
  // separate narrative pipeline has populated it. Falls back to the
  // most recent session's coach_message until the user has had at
  // least one session-end-with-narrative run.
  let growthNarrative: string | null = null;
  if (!isDemo) {
    const ctx = await supabaseForUser();
    if (ctx) {
      const [lastSessionRes, coachingStateRes] = await Promise.all([
        topGoal?.last_session_id
          ? ctx.client
              .from("sessions")
              .select("ended_at")
              .eq("id", topGoal.last_session_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        ctx.client
          .from("coaching_state")
          .select("growth_narrative")
          .maybeSingle(),
      ]);
      topGoalLastSessionEndedAt = lastSessionRes.data?.ended_at ?? null;
      growthNarrative = coachingStateRes.data?.growth_narrative?.trim() || null;
    }
  }

  return (
    <PageShell active="home" navHrefSuffix={isDemo ? "?demo=1" : ""}>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">
        Welcome to InnerVerse
      </h1>
      <p className="mt-1 text-sm text-neutral-400 sm:text-base">
        Ready to start your growth journey?
        {isDemo ? (
          <span className="text-amber-400"> (demo mode)</span>
        ) : null}
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
        <TopGoalCard
          topGoal={topGoal}
          topGoalLastSessionEndedAt={topGoalLastSessionEndedAt}
        />
      </div>

      {growthNarrative || lastSession?.coach_message ? (
        <MessageFromCoachCard
          message={growthNarrative ?? lastSession?.coach_message ?? ""}
        />
      ) : null}
      <PersonalGrowthProgressCard
        items={recentGrowth}
        sessionsBase={isDemo ? "/sessions?demo=1" : "/sessions"}
      />
      <RecentBreakthroughsCard
        items={recentBreakthroughs}
        progressBase={isDemo ? "/progress?demo=1" : "/progress"}
      />
    </PageShell>
  );
}

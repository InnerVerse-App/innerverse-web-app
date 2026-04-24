import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
  type OnboardingState,
} from "@/lib/onboarding";
import { coachLabel } from "@/lib/onboarding-labels";
import { supabaseForUser } from "@/lib/supabase";

import {
  FirstSessionCard,
  LastSessionCard,
  type LastSession,
} from "./LastSessionCard";
import {
  PersonalGrowthProgressCard,
  type RecentGrowthItem,
} from "./PersonalGrowthProgressCard";
import { TopGoalCard } from "./TopGoalCard";
import { YourMetricsCard } from "./YourMetricsCard";

export const dynamic = "force-dynamic";

// Streak window. Any streak longer than this is cosmetic overflow —
// the home card doesn't need exact counts past 60 days, and capping
// here keeps the timestamp payload sent to StreakBadge small.
const STREAK_WINDOW_DAYS = 60;

// How many recent sessions the Personal Growth Progress card shows.
// Canonical (homescreen-4) shows 2 items; we allow up to 3 so the
// card fills out once the user has enough analyzed sessions.
const GROWTH_PROGRESS_LIMIT = 3;

// Goals count: predefined top_goals plus an optional free-text goal.
// Matches the Goals-tab rendering (src/app/goals/page.tsx).
function goalCountFromOnboarding(state: OnboardingState | null): number {
  if (!state) return 0;
  const predefined = state.top_goals?.length ?? 0;
  const freeText = state.top_goals_input?.trim() ? 1 : 0;
  return predefined + freeText;
}

// Top goal surfaced on the Home card: first predefined goal, or the
// free-text input if no predefined exists, or null. Returns null only
// when both are empty — the TopGoalCard handles the empty case with a
// link to /goals.
function topGoalFromOnboarding(state: OnboardingState | null): string | null {
  if (!state) return null;
  const first = state.top_goals?.[0]?.trim();
  if (first) return first;
  const freeText = state.top_goals_input?.trim();
  if (freeText) return freeText;
  return null;
}

type HomeData = {
  lastSession: LastSession | null;
  sessionCount: number;
  endedTimestamps: string[];
  recentGrowth: RecentGrowthItem[];
};

// Row shape for the growth-progress query. Supabase Postgrest's
// nested select returns breakthroughs as an array of related rows.
type GrowthRow = {
  id: string;
  ended_at: string | null;
  progress_percent: number | null;
  progress_summary_short: string | null;
  breakthroughs: Array<{ content: string | null; note: string | null }>;
};

// Build one Personal Growth Progress row per recent session. Prefer
// the first breakthrough's content as the title (human-framed growth
// moment); fall back to progress_summary_short if no breakthrough
// was emitted for that session. note is the breakthrough's subtext,
// which may be null (hidden in the card).
function buildGrowthItems(rows: GrowthRow[]): RecentGrowthItem[] {
  return rows
    .filter((r) => r.progress_percent !== null)
    .map((r) => {
      const firstBreakthrough = r.breakthroughs[0];
      const title =
        firstBreakthrough?.content?.trim() ||
        r.progress_summary_short?.trim() ||
        "Growth session";
      const note = firstBreakthrough?.note?.trim() || null;
      return {
        sessionId: r.id,
        progressPercent: r.progress_percent as number,
        title,
        note,
      };
    });
}

// Four parallel Supabase reads. All four are RLS-scoped so the
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
    };
  }

  const streakWindowIso = new Date(
    Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [lastRes, countRes, tsRes, growthRes] = await Promise.all([
    ctx.client
      .from("sessions")
      .select("id, ended_at, summary, progress_summary_short")
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
      .order("ended_at", { ascending: false }),
    ctx.client
      .from("sessions")
      .select(
        "id, ended_at, progress_percent, progress_summary_short, breakthroughs(content, note)",
      )
      .not("ended_at", "is", null)
      .not("progress_percent", "is", null)
      .order("ended_at", { ascending: false })
      .limit(GROWTH_PROGRESS_LIMIT),
  ]);

  if (lastRes.error) throw lastRes.error;
  if (countRes.error) throw countRes.error;
  if (tsRes.error) throw tsRes.error;
  if (growthRes.error) throw growthRes.error;

  const timestampRows = (tsRes.data ?? []) as Array<{
    ended_at: string | null;
  }>;

  return {
    lastSession: (lastRes.data as LastSession | null) ?? null,
    sessionCount: countRes.count ?? 0,
    endedTimestamps: timestampRows
      .map((r) => r.ended_at)
      .filter((x): x is string => !!x),
    recentGrowth: buildGrowthItems((growthRes.data ?? []) as GrowthRow[]),
  };
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
  const { lastSession, sessionCount, endedTimestamps, recentGrowth } =
    await loadHomeData();
  const goalCount = goalCountFromOnboarding(state);
  const topGoalTitle = topGoalFromOnboarding(state);

  return (
    <PageShell active="home">
      <h1 className="text-3xl font-bold text-white sm:text-4xl">
        Welcome to InnerVerse
      </h1>
      <p className="mt-1 text-sm text-neutral-400 sm:text-base">
        Ready to start your growth journey?
      </p>

      {lastSession ? (
        <LastSessionCard session={lastSession} />
      ) : (
        <FirstSessionCard coachLabelText={coach} />
      )}

      {/* 2-col grid: Your Metrics | Top Goal. Matches canonical
          app-screenshot-homescreen-5.jpeg. Stays 2-col even on narrow
          mobile per the Bubble design; cards are compact enough to
          read at phone width. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <YourMetricsCard
          sessionCount={sessionCount}
          goalCount={goalCount}
          endedTimestamps={endedTimestamps}
        />
        <TopGoalCard topGoalRaw={topGoalTitle} />
      </div>

      <PersonalGrowthProgressCard items={recentGrowth} />
    </PageShell>
  );
}

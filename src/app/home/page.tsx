import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { COACHES } from "@/app/onboarding/data";
import {
  getOnboardingState,
  isOnboardingComplete,
  type OnboardingState,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import {
  FirstSessionCard,
  LastSessionCard,
  type LastSession,
} from "./LastSessionCard";
import { TopGoalCard } from "./TopGoalCard";
import { YourMetricsCard } from "./YourMetricsCard";

export const dynamic = "force-dynamic";

// Streak window. Any streak longer than this is cosmetic overflow —
// the home card doesn't need exact counts past 60 days, and capping
// here keeps the timestamp payload sent to StreakBadge small.
const STREAK_WINDOW_DAYS = 60;

function coachLabel(coachValue: string | null | undefined): string {
  if (!coachValue) return "your coach";
  return COACHES.find((c) => c.value === coachValue)?.label ?? "your coach";
}

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
};

// Three parallel Supabase reads. All three are RLS-scoped so the
// supabaseForUser context is required; an unauthenticated caller
// short-circuits to empty counts (though HomePage's auth gate above
// should prevent that).
async function loadHomeData(): Promise<HomeData> {
  const ctx = await supabaseForUser();
  if (!ctx) {
    return { lastSession: null, sessionCount: 0, endedTimestamps: [] };
  }

  const streakWindowIso = new Date(
    Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [lastRes, countRes, tsRes] = await Promise.all([
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
  ]);

  if (lastRes.error) throw lastRes.error;
  if (countRes.error) throw countRes.error;
  if (tsRes.error) throw tsRes.error;

  const timestampRows = (tsRes.data ?? []) as Array<{
    ended_at: string | null;
  }>;

  return {
    lastSession: (lastRes.data as LastSession | null) ?? null,
    sessionCount: countRes.count ?? 0,
    endedTimestamps: timestampRows
      .map((r) => r.ended_at)
      .filter((x): x is string => !!x),
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
  const { lastSession, sessionCount, endedTimestamps } = await loadHomeData();
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
        <TopGoalCard topGoalTitle={topGoalTitle} />
      </div>
    </PageShell>
  );
}

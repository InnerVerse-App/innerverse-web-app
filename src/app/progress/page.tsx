import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { RecencyBar } from "@/app/_components/RecencyBar";
import { loadActiveGoalsWithLazySeed } from "@/lib/goals";
import { formatDateCompact } from "@/lib/format";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser, type UserSupabase } from "@/lib/supabase";

import { Constellation } from "./Constellation";
import {
  type ConstellationLayout,
  computeLayout,
} from "./constellation-layout";
import { buildDemoData, DEMO_LEGACY_SECTIONS } from "./demo-data";

export const dynamic = "force-dynamic";

const CONSTELLATION_SESSION_LIMIT = 10;

// Convert the ?window= query value into the layout's ageWindowDays
// parameter. "all" maps to 10 years — effectively no clamping for any
// realistic data set.
function parseAgeWindowDays(windowParam: string | undefined): number {
  if (windowParam === "all") return 365 * 10;
  if (windowParam === "365") return 365;
  if (windowParam === "90") return 90;
  return 30;
}

type TextRow = {
  id: string;
  content: string;
  created_at: string;
};

type LegacySectionData = {
  breakthroughs: TextRow[];
  insights: TextRow[];
};

type SessionRow = {
  id: string;
  ended_at: string;
};

type BreakthroughRow = {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
};

type InsightRow = {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
};

async function loadLegacySections(
  ctx: UserSupabase,
): Promise<LegacySectionData> {
  const [brRes, inRes] = await Promise.all([
    ctx.client
      .from("breakthroughs")
      .select("id, content, created_at")
      .order("created_at", { ascending: false }),
    ctx.client
      .from("insights")
      .select("id, content, created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (brRes.error) throw brRes.error;
  if (inRes.error) throw inRes.error;
  return {
    breakthroughs: (brRes.data as TextRow[] | null) ?? [],
    insights: (inRes.data as TextRow[] | null) ?? [],
  };
}

async function loadConstellation(
  ctx: UserSupabase,
  ageWindowDays: number,
): Promise<{
  layout: ConstellationLayout;
  hasGoals: boolean;
}> {
  const sessionsRes = await ctx.client
    .from("sessions")
    .select("id, ended_at")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(CONSTELLATION_SESSION_LIMIT);
  if (sessionsRes.error) throw sessionsRes.error;
  const sessionRows = (sessionsRes.data ?? []) as SessionRow[];
  const sessionIds = sessionRows.map((s) => s.id);

  const [breakthroughsRes, insightsRes, activeGoals] = await Promise.all([
    sessionIds.length > 0
      ? ctx.client
          .from("breakthroughs")
          .select("id, session_id, content, created_at")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null as null | Error }),
    sessionIds.length > 0
      ? ctx.client
          .from("insights")
          .select("id, session_id, content, created_at")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null as null | Error }),
    loadActiveGoalsWithLazySeed(ctx),
  ]);
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (insightsRes.error) throw insightsRes.error;

  const goalLastSessionIds = activeGoals
    .map((g) => g.last_session_id)
    .filter((id): id is string => !!id && !sessionIds.includes(id));
  const extraSessionEndedById = new Map<string, string>();
  if (goalLastSessionIds.length > 0) {
    const extraRes = await ctx.client
      .from("sessions")
      .select("id, ended_at")
      .in("id", goalLastSessionIds);
    if (extraRes.error) throw extraRes.error;
    for (const row of (extraRes.data ?? []) as Array<{
      id: string;
      ended_at: string | null;
    }>) {
      if (row.ended_at) extraSessionEndedById.set(row.id, row.ended_at);
    }
  }
  const sessionEndedById = new Map<string, string>(
    sessionRows.map((s) => [s.id, s.ended_at]),
  );
  for (const [id, endedAt] of extraSessionEndedById) {
    sessionEndedById.set(id, endedAt);
  }

  const layout = computeLayout({
    ageWindowDays,
    sessions: sessionRows.map((s) => ({ id: s.id, endedAt: s.ended_at })),
    breakthroughs: ((breakthroughsRes.data ?? []) as BreakthroughRow[]).map(
      (b) => ({
        id: b.id,
        sessionId: b.session_id,
        content: b.content,
        createdAt: b.created_at,
      }),
    ),
    mindsetShifts: ((insightsRes.data ?? []) as InsightRow[]).map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      content: m.content,
      createdAt: m.created_at,
    })),
    goals: activeGoals.map((g) => ({
      id: g.id,
      title: g.title,
      lastEngagedAt: g.last_session_id
        ? sessionEndedById.get(g.last_session_id) ?? null
        : null,
    })),
  });

  return { layout, hasGoals: activeGoals.length > 0 };
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    demo?: string;
    constellation?: string;
    window?: string;
  }>;
}) {
  const params = await searchParams;
  const ageWindowDays = parseAgeWindowDays(params.window);

  if (params.demo === "1") {
    const demo = buildDemoData();
    const layout = computeLayout({ ...demo, ageWindowDays });
    const selectedBreakthroughId = params.constellation ?? null;
    return (
      <PageShell active="progress" navHrefSuffix="?demo=1">
        <h1 className="text-3xl font-bold text-white">Your Progress</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Track your personal growth development.{" "}
          <span className="text-amber-400">(demo mode)</span>
        </p>
        <Constellation
          layout={layout}
          hasGoals={true}
          goalsHref="/goals?demo=1"
          constellationLinks={demo.constellationLinks}
          selectedBreakthroughId={selectedBreakthroughId}
          basePath="/progress"
          currentParams={{
            demo: "1",
            constellation: selectedBreakthroughId ?? undefined,
            window: params.window,
          }}
        />
        <Section
          title="Breakthroughs"
          items={DEMO_LEGACY_SECTIONS.breakthroughs}
          recencyColor="#DCA114"
          idPrefix="bt"
          selectableConstellationFor={(item) =>
            buildSelectUrl({
              demo: "1",
              constellation: item.id,
              window: params.window,
            })
          }
        />
        <Section
          title="Insights"
          items={DEMO_LEGACY_SECTIONS.insights}
          recencyColor="#A78BFA"
          idPrefix="ms"
        />
      </PageShell>
    );
  }

  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const [{ layout, hasGoals }, { breakthroughs, insights }] = await Promise.all([
    loadConstellation(ctx, ageWindowDays),
    loadLegacySections(ctx),
  ]);
  const selectedBreakthroughId = params.constellation ?? null;

  return (
    <PageShell active="progress">
      <h1 className="text-3xl font-bold text-white">Your Progress</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Track your personal growth development.
      </p>

      <Constellation
        layout={layout}
        hasGoals={hasGoals}
        constellationLinks={undefined}
        selectedBreakthroughId={selectedBreakthroughId}
        basePath="/progress"
        currentParams={{
          constellation: selectedBreakthroughId ?? undefined,
          window: params.window,
        }}
      />

      <Section
        title="Breakthroughs"
        items={breakthroughs}
        recencyColor="#DCA114"
        idPrefix="bt"
        selectableConstellationFor={(item) =>
          buildSelectUrl({
            constellation: item.id,
            window: params.window,
          })
        }
      />
      <Section
        title="Insights"
        items={insights}
        recencyColor="#A78BFA"
        idPrefix="ms"
      />
    </PageShell>
  );
}

// Build a /progress URL with the given params, preserving any others
// that are passed in. Tail anchor `#constellation-map` makes the
// browser scroll back up to the star map after navigating.
function buildSelectUrl(params: {
  demo?: string;
  constellation?: string;
  window?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.demo) sp.set("demo", params.demo);
  if (params.constellation) sp.set("constellation", params.constellation);
  if (params.window) sp.set("window", params.window);
  const qs = sp.toString();
  return qs ? `/progress?${qs}#constellation-map` : `/progress#constellation-map`;
}

function Section({
  title,
  items,
  recencyColor,
  idPrefix,
  selectableConstellationFor,
}: {
  title: string;
  items: TextRow[];
  recencyColor: string;
  idPrefix: string;
  // Optional: when provided, each card becomes a Link that selects
  // that item's constellation on the star map (and anchor-scrolls
  // back up). Used for the Breakthroughs section.
  selectableConstellationFor?: (item: TextRow) => string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing here yet — {title.toLowerCase()} are created from your
          coaching sessions.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => {
            const cardClass =
              "scroll-mt-20 block rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 transition target:border-brand-primary target:bg-brand-primary/10 target:shadow-[0_0_0_1px_var(--tw-shadow-color)] target:shadow-brand-primary/40";
            const inner = (
              <>
                <p className="text-sm text-neutral-200">{item.content}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {formatDateCompact(item.created_at)}
                </p>
                <RecencyBar
                  lastEngagedAt={item.created_at}
                  color={recencyColor}
                />
              </>
            );
            const href = selectableConstellationFor?.(item);
            return (
              <li key={item.id} id={`${idPrefix}-${item.id}`}>
                {href ? (
                  <Link
                    href={href}
                    className={cardClass + " hover:border-brand-primary/40"}
                    title="View this constellation on the star map"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cardClass}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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

type SearchParamsShape = {
  demo?: string;
  constellation?: string;
  shift?: string;
  goal?: string;
  window?: string;
};

// Resolve the URL params to a single selectedAnchor (or null). Only
// one of constellation / shift / goal is honored per render — the
// first one set wins.
function resolveSelectedAnchor(
  p: SearchParamsShape,
):
  | { type: "breakthrough"; id: string }
  | { type: "shift"; id: string }
  | { type: "goal"; id: string }
  | null {
  if (p.constellation) return { type: "breakthrough", id: p.constellation };
  if (p.shift) return { type: "shift", id: p.shift };
  if (p.goal) return { type: "goal", id: p.goal };
  return null;
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>;
}) {
  const params = await searchParams;
  const ageWindowDays = parseAgeWindowDays(params.window);
  const selectedAnchor = resolveSelectedAnchor(params);

  if (params.demo === "1") {
    const demo = buildDemoData();
    const layout = computeLayout({ ...demo, ageWindowDays });

    // Build expanded-detail strings from the demo links so each card
    // tells the user what led to it.
    const breakthroughDetailFor = (item: TextRow) => {
      const links = demo.constellationLinks.get(item.id);
      if (!links) return null;
      return `Built across ${links.sessionIds.length} session${links.sessionIds.length === 1 ? "" : "s"}, ${links.shiftIds.length} mindset shift${links.shiftIds.length === 1 ? "" : "s"}, and ${links.goalIds.length} goal${links.goalIds.length === 1 ? "" : "s"}. The constellation "${links.name}" maps the path.`;
    };
    const shiftDetailFor = (item: TextRow) => {
      const links = demo.mindsetShiftLinks.get(item.id);
      if (!links) return null;
      return `Emerged across ${links.sessionIds.length} session${links.sessionIds.length === 1 ? "" : "s"} of practice. Tap to see the path on the star map.`;
    };

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
          mindsetShiftLinks={demo.mindsetShiftLinks}
          goalLinks={demo.goalLinks}
          selectedAnchor={selectedAnchor}
          basePath="/progress"
          currentParams={{
            demo: "1",
            constellation:
              selectedAnchor?.type === "breakthrough"
                ? selectedAnchor.id
                : undefined,
            shift:
              selectedAnchor?.type === "shift" ? selectedAnchor.id : undefined,
            goal:
              selectedAnchor?.type === "goal" ? selectedAnchor.id : undefined,
            window: params.window,
          }}
        />
        <ExpandableList
          title="Breakthroughs"
          items={DEMO_LEGACY_SECTIONS.breakthroughs}
          recencyColor="#DCA114"
          idPrefix="bt"
          expandedDetailFor={breakthroughDetailFor}
          buildStarMapHref={(item) =>
            buildSelectUrl({
              demo: "1",
              constellation: item.id,
              window: params.window,
            })
          }
          buttonLabel="See constellation"
        />
        <ExpandableList
          title="Mindset shifts"
          items={DEMO_LEGACY_SECTIONS.insights}
          recencyColor="#A78BFA"
          idPrefix="ms"
          expandedDetailFor={shiftDetailFor}
          buildStarMapHref={(item) =>
            buildSelectUrl({
              demo: "1",
              shift: item.id,
              window: params.window,
            })
          }
          buttonLabel="See on star map"
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
        mindsetShiftLinks={undefined}
        goalLinks={undefined}
        selectedAnchor={selectedAnchor}
        basePath="/progress"
        currentParams={{
          constellation:
            selectedAnchor?.type === "breakthrough"
              ? selectedAnchor.id
              : undefined,
          shift:
            selectedAnchor?.type === "shift" ? selectedAnchor.id : undefined,
          goal:
            selectedAnchor?.type === "goal" ? selectedAnchor.id : undefined,
          window: params.window,
        }}
      />

      <ExpandableList
        title="Breakthroughs"
        items={breakthroughs}
        recencyColor="#DCA114"
        idPrefix="bt"
        buildStarMapHref={(item) =>
          buildSelectUrl({
            constellation: item.id,
            window: params.window,
          })
        }
        buttonLabel="See constellation"
      />
      <ExpandableList
        title="Mindset shifts"
        items={insights}
        recencyColor="#A78BFA"
        idPrefix="ms"
        buildStarMapHref={(item) =>
          buildSelectUrl({
            shift: item.id,
            window: params.window,
          })
        }
        buttonLabel="See on star map"
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
  shift?: string;
  goal?: string;
  window?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.demo) sp.set("demo", params.demo);
  if (params.constellation) sp.set("constellation", params.constellation);
  if (params.shift) sp.set("shift", params.shift);
  if (params.goal) sp.set("goal", params.goal);
  if (params.window) sp.set("window", params.window);
  const qs = sp.toString();
  return qs ? `/progress?${qs}#constellation-map` : `/progress#constellation-map`;
}

// Expandable list — caps to ~5 items visible; older content scrolls.
// Each card uses native <details>/<summary> so expand/collapse is
// per-card and free of client state. The expanded body shows
// contextual info + a "See on star map" button that anchors back to
// the constellation panel.
function ExpandableList({
  title,
  emoji,
  items,
  recencyColor,
  idPrefix,
  buildStarMapHref,
  expandedDetailFor,
  buttonLabel,
}: {
  title: string;
  emoji?: string;
  items: TextRow[];
  recencyColor: string;
  idPrefix: string;
  buildStarMapHref?: (item: TextRow) => string;
  expandedDetailFor?: (item: TextRow) => string | null;
  buttonLabel?: string;
}) {
  const visibleHeightPx = 420; // ≈ 5 collapsed cards
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing here yet — {title.toLowerCase()} are created from your
          coaching sessions.
        </p>
      ) : (
        <div
          className="mt-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent"
          style={{
            maxHeight: `${visibleHeightPx}px`,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.15) transparent",
          }}
        >
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const targetId = `${idPrefix}-${item.id}`;
              const detail = expandedDetailFor?.(item) ?? null;
              const starMapHref = buildStarMapHref?.(item) ?? null;
              return (
                <li key={item.id}>
                  <details
                    id={targetId}
                    className="group scroll-mt-20 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 transition target:border-brand-primary target:bg-brand-primary/10 target:shadow-[0_0_18px_rgba(89,164,192,0.35)]"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <div className="flex-1">
                        <p className="text-sm text-neutral-200">
                          {emoji ? <span className="mr-1.5">{emoji}</span> : null}
                          {item.content}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          {formatDateCompact(item.created_at)}
                        </p>
                        <RecencyBar
                          lastEngagedAt={item.created_at}
                          color={recencyColor}
                        />
                      </div>
                      <span
                        className="mt-0.5 inline-block shrink-0 text-neutral-500 transition group-open:rotate-180"
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
                    <div className="mt-3 border-t border-white/5 pt-3">
                      {detail ? (
                        <p className="text-xs leading-relaxed text-neutral-400">
                          {detail}
                        </p>
                      ) : null}
                      {starMapHref ? (
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
                          {buttonLabel ?? "See on star map"}
                        </Link>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

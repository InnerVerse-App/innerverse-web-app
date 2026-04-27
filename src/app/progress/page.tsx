import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { AutoScrollToTarget } from "@/app/_components/AutoScrollToTarget";
import {
  type ExpandedDetail,
  ExpandedDetailBody,
} from "@/app/_components/ExpandedDetailBody";
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
import { buildDemoData, DEMO_LEGACY_SECTIONS, snippetFor } from "./demo-data";

export const dynamic = "force-dynamic";

// How many sessions to pull into the universe view. Galaxy V3 needs
// enough history for breakthroughs (rare — ~one per 6 weeks per the
// session-end prompt) to actually appear, so we reach back across
// roughly a year of weekly cadence. Older sessions referenced as
// contributors render as empty positions (no visible star) which is
// acceptable — galaxies still display, just without their oldest
// contributor stars.
const CONSTELLATION_SESSION_LIMIT = 200;

// Convert the ?window= query value into the layout's ageWindowDays
// parameter. "all" maps to 10 years — effectively no clamping for
// any realistic data set. Default is 365 days so the recency curve
// has visible variation across the user's whole year of work
// instead of pinning everything older than 30d to the floor.
function parseAgeWindowDays(windowParam: string | undefined): number {
  if (windowParam === "all") return 365 * 10;
  if (windowParam === "30") return 30;
  if (windowParam === "90") return 90;
  return 365;
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

// V.5a contributor arrays come straight from public.breakthroughs.
// `direct_session_ids` is the subset of `contributing_session_ids`
// that fed the breakthrough WITHOUT routing through a mindset shift
// — the layered tree renderer needs both lists.
type BreakthroughRow = {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
  contributing_session_ids: string[] | null;
  contributing_shift_ids: string[] | null;
  direct_session_ids: string[] | null;
  evidence_quote: string | null;
  galaxy_name: string | null;
};

type InsightRow = {
  id: string;
  session_id: string;
  content: string;
  created_at: string;
  contributing_session_ids: string[] | null;
  evidence_quote: string | null;
};

// Goal contributor arrays read from public.goals. Only fetched for
// goals returned by loadActiveGoalsWithLazySeed — keeps the read
// scoped without changing the shared ActiveGoal shape.
type GoalContributorRow = {
  id: string;
  contributing_session_ids: string[] | null;
  contributing_shift_ids: string[] | null;
  contributing_breakthrough_ids: string[] | null;
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

// Same shape the demo path constructs in demo-data.ts. The layout
// + line layer in Constellation.tsx don't care whether the entries
// are demo-generated or read from V.5a contributor columns.
type ConstellationLinks = {
  name: string;
  sessionIds: string[];
  shiftIds: string[];
  directSessionIds: string[];
};
type MindsetShiftLinks = { sessionIds: string[] };
type GoalLinks = {
  sessionIds: string[];
  shiftIds: string[];
  breakthroughIds: string[];
};

async function loadConstellation(
  ctx: UserSupabase,
  ageWindowDays: number,
): Promise<{
  layout: ConstellationLayout;
  hasGoals: boolean;
  breakthroughById: Map<string, BreakthroughRow>;
  insightById: Map<string, InsightRow>;
  sessionEndedById: Map<string, string>;
  constellationLinks: Map<string, ConstellationLinks>;
  mindsetShiftLinks: Map<string, MindsetShiftLinks>;
  goalLinks: Map<string, GoalLinks>;
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

  const [breakthroughsRes, insightsRes, activeGoals, goalContribRes] =
    await Promise.all([
      sessionIds.length > 0
        ? ctx.client
            .from("breakthroughs")
            .select(
              "id, session_id, content, created_at, contributing_session_ids, contributing_shift_ids, direct_session_ids, evidence_quote, galaxy_name",
            )
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null as null | Error }),
      sessionIds.length > 0
        ? ctx.client
            .from("insights")
            .select(
              "id, session_id, content, created_at, contributing_session_ids, evidence_quote",
            )
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null as null | Error }),
      loadActiveGoalsWithLazySeed(ctx),
      // Goal contributor arrays. Loaded for every active goal — V.5a
      // session-end writes these on every analyzed session, so even
      // recently-seeded predefined goals get filled in over time.
      ctx.client
        .from("goals")
        .select(
          "id, contributing_session_ids, contributing_shift_ids, contributing_breakthrough_ids",
        )
        .is("archived_at", null),
    ]);
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (insightsRes.error) throw insightsRes.error;
  if (goalContribRes.error) throw goalContribRes.error;

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

  const breakthroughRows = (breakthroughsRes.data ?? []) as BreakthroughRow[];
  const insightRows = (insightsRes.data ?? []) as InsightRow[];
  const goalContribRows = (goalContribRes.data ?? []) as GoalContributorRow[];

  // V.5a contributor maps. The LLM emits these arrays directly from
  // session-end analysis (after the prompt-v6 evidence rubric); the
  // RPC stores them on the row. No heuristic derivation here — what
  // the constellation draws is what the model claimed contributed.
  // `galaxy_name` is the LLM-emitted constellation label; falls back
  // to the first words of the breakthrough content if missing.
  const constellationLinks = new Map<string, ConstellationLinks>();
  for (const b of breakthroughRows) {
    constellationLinks.set(b.id, {
      name: b.galaxy_name?.trim() || fallbackGalaxyName(b.content),
      sessionIds: b.contributing_session_ids ?? [],
      shiftIds: b.contributing_shift_ids ?? [],
      directSessionIds: b.direct_session_ids ?? [],
    });
  }

  const mindsetShiftLinks = new Map<string, MindsetShiftLinks>();
  for (const m of insightRows) {
    mindsetShiftLinks.set(m.id, {
      sessionIds: m.contributing_session_ids ?? [],
    });
  }

  const goalLinks = new Map<string, GoalLinks>();
  for (const g of goalContribRows) {
    goalLinks.set(g.id, {
      sessionIds: g.contributing_session_ids ?? [],
      shiftIds: g.contributing_shift_ids ?? [],
      breakthroughIds: g.contributing_breakthrough_ids ?? [],
    });
  }

  const layout = computeLayout({
    ageWindowDays,
    sessions: sessionRows.map((s) => ({ id: s.id, endedAt: s.ended_at })),
    breakthroughs: breakthroughRows.map((b) => ({
      id: b.id,
      sessionId: b.session_id,
      content: b.content,
      createdAt: b.created_at,
    })),
    mindsetShifts: insightRows.map((m) => ({
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
    constellationLinks,
  });

  const breakthroughById = new Map(breakthroughRows.map((b) => [b.id, b]));
  const insightById = new Map(insightRows.map((m) => [m.id, m]));

  return {
    layout,
    hasGoals: activeGoals.length > 0,
    breakthroughById,
    insightById,
    sessionEndedById,
    constellationLinks,
    mindsetShiftLinks,
    goalLinks,
  };
}

// Stripped-down galaxy name when the model didn't emit one. First
// few content words, title-cased — readable but obviously a fallback
// (no flourish like "The Sovereign" or "Belonging Without Bargaining").
function fallbackGalaxyName(content: string): string {
  const words = content.trim().split(/\s+/).slice(0, 4).join(" ");
  return words || "Untitled Galaxy";
}

type SearchParamsShape = {
  demo?: string;
  constellation?: string;
  shift?: string;
  goal?: string;
  session?: string;
  window?: string;
};

// Resolve the URL params to a single selectedAnchor (or null). Only
// one of constellation / shift / goal / session is honored per
// render — the first one set wins.
function resolveSelectedAnchor(
  p: SearchParamsShape,
):
  | { type: "breakthrough"; id: string }
  | { type: "shift"; id: string }
  | { type: "goal"; id: string }
  | { type: "session"; id: string }
  | null {
  if (p.constellation) return { type: "breakthrough", id: p.constellation };
  if (p.shift) return { type: "shift", id: p.shift };
  if (p.goal) return { type: "goal", id: p.goal };
  if (p.session) return { type: "session", id: p.session };
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
    const layout = computeLayout({
      ...demo,
      ageWindowDays,
      constellationLinks: demo.constellationLinks,
    });
    // Single-click on a star sets the anchor and updates the
    // constellation map in place — no page-scroll. The user
    // explicitly opted into "navigate to detail" via double-click,
    // which is wired separately. Setting autoScrollId to null
    // keeps the scroll position where the user clicked.
    const autoScrollId = null;

    // Demo lookup maps so we can resolve link ids → display data.
    const sessionById = new Map(
      demo.sessions.map((s) => [s.id, s] as const),
    );
    const shiftById = new Map(
      demo.mindsetShifts.map((m) => [m.id, m] as const),
    );

    const breakthroughDetailFor = (
      item: TextRow,
    ): ExpandedDetail | null => {
      const links = demo.constellationLinks.get(item.id);
      if (!links) return null;
      const sessions = links.sessionIds
        .map((id) => sessionById.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({
          id: s.id,
          endedAt: s.endedAt,
          snippet: snippetFor(item.id, s.id, "session"),
        }))
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
      const shifts = links.shiftIds
        .map((id) => shiftById.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({
          id: m.id,
          content: m.content,
          snippet: snippetFor(item.id, m.id, "shift"),
        }));
      const narrative =
        sessions.length > 0
          ? `This breakthrough emerged from ${sessions.length} coaching session${sessions.length === 1 ? "" : "s"} and ${shifts.length} mindset shift${shifts.length === 1 ? "" : "s"} of practice. The constellation "${links.name}" traces the path.`
          : `The constellation "${links.name}" traces the path to this breakthrough.`;
      return { narrative, sessions, shifts, breakthroughs: [] };
    };

    const shiftDetailFor = (item: TextRow): ExpandedDetail | null => {
      const links = demo.mindsetShiftLinks.get(item.id);
      if (!links) return null;
      const sessions = links.sessionIds
        .map((id) => sessionById.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({
          id: s.id,
          endedAt: s.endedAt,
          snippet: snippetFor(item.id, s.id, "session"),
        }))
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
      const narrative =
        sessions.length > 0
          ? `This shift emerged across ${sessions.length} coaching session${sessions.length === 1 ? "" : "s"} of practice.`
          : "This shift is still settling in.";
      const noticedAt = snippetFor(item.id, item.id, "noticed");
      return {
        narrative,
        noticedAt,
        sessions,
        shifts: [],
        breakthroughs: [],
      };
    };

    return (
      <PageShell active="progress" navHrefSuffix="?demo=1">
        <AutoScrollToTarget targetId={autoScrollId} />
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
            session:
              selectedAnchor?.type === "session"
                ? selectedAnchor.id
                : undefined,
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
          highlightedItemId={
            selectedAnchor?.type === "breakthrough"
              ? selectedAnchor.id
              : null
          }
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
          highlightedItemId={
            selectedAnchor?.type === "shift" ? selectedAnchor.id : null
          }
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

  const [
    {
      layout,
      hasGoals,
      breakthroughById,
      insightById,
      sessionEndedById,
      constellationLinks,
      mindsetShiftLinks,
      goalLinks,
    },
    { breakthroughs, insights },
  ] = await Promise.all([
    loadConstellation(ctx, ageWindowDays),
    loadLegacySections(ctx),
  ]);

  // Real-data expanded-detail builders. Mirror the demo path's shape
  // but use V.5a evidence_quote in place of demo's per-(parent,
  // contributor) snippet pool. Per-row snippet is empty — the date
  // pill carries its own meaning and we don't have a per-relationship
  // narrative to fill in. The breakthrough/shift evidence_quote
  // surfaces once, in the noticedAt row.
  const breakthroughDetailFor = (item: TextRow): ExpandedDetail | null => {
    const links = constellationLinks.get(item.id);
    if (!links) return null;
    const row = breakthroughById.get(item.id);
    const sessions = links.sessionIds
      .map((id) => {
        const endedAt = sessionEndedById.get(id);
        if (!endedAt) return null;
        return { id, endedAt, snippet: "" };
      })
      .filter((s): s is { id: string; endedAt: string; snippet: string } => !!s)
      .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    const shifts = links.shiftIds
      .map((id) => {
        const m = insightById.get(id);
        if (!m) return null;
        return { id, content: m.content, snippet: "" };
      })
      .filter(
        (s): s is { id: string; content: string; snippet: string } => !!s,
      );
    const sCount = sessions.length;
    const shCount = shifts.length;
    const namePart = links.name ? ` "${links.name}"` : "";
    const narrative =
      sCount > 0
        ? `This breakthrough emerged from ${sCount} coaching session${sCount === 1 ? "" : "s"} and ${shCount} mindset shift${shCount === 1 ? "" : "s"} of practice. The constellation${namePart} traces the path.`
        : `The constellation${namePart} traces the path to this breakthrough.`;
    const noticedAt = row?.evidence_quote?.trim() || undefined;
    return { narrative, noticedAt, sessions, shifts, breakthroughs: [] };
  };

  const shiftDetailFor = (item: TextRow): ExpandedDetail | null => {
    const links = mindsetShiftLinks.get(item.id);
    const row = insightById.get(item.id);
    if (!links && !row) return null;
    const sessions = (links?.sessionIds ?? [])
      .map((id) => {
        const endedAt = sessionEndedById.get(id);
        if (!endedAt) return null;
        return { id, endedAt, snippet: "" };
      })
      .filter((s): s is { id: string; endedAt: string; snippet: string } => !!s)
      .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    const sCount = sessions.length;
    const narrative =
      sCount > 0
        ? `This shift emerged across ${sCount} coaching session${sCount === 1 ? "" : "s"} of practice.`
        : "This shift is still settling in.";
    const noticedAt = row?.evidence_quote?.trim() || undefined;
    return { narrative, noticedAt, sessions, shifts: [], breakthroughs: [] };
  };

  return (
    <PageShell active="progress">
      <h1 className="text-3xl font-bold text-white">Your Progress</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Track your personal growth development.
      </p>

      <Constellation
        layout={layout}
        hasGoals={hasGoals}
        constellationLinks={constellationLinks}
        mindsetShiftLinks={mindsetShiftLinks}
        goalLinks={goalLinks}
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
          session:
            selectedAnchor?.type === "session"
              ? selectedAnchor.id
              : undefined,
          window: params.window,
        }}
      />

      <ExpandableList
        title="Breakthroughs"
        items={breakthroughs}
        recencyColor="#DCA114"
        idPrefix="bt"
        expandedDetailFor={breakthroughDetailFor}
        buildStarMapHref={(item) =>
          buildSelectUrl({
            constellation: item.id,
            window: params.window,
          })
        }
        buttonLabel="See constellation"
        highlightedItemId={
          selectedAnchor?.type === "breakthrough"
            ? selectedAnchor.id
            : null
        }
      />
      <ExpandableList
        title="Mindset shifts"
        items={insights}
        recencyColor="#A78BFA"
        idPrefix="ms"
        expandedDetailFor={shiftDetailFor}
        buildStarMapHref={(item) =>
          buildSelectUrl({
            shift: item.id,
            window: params.window,
          })
        }
        buttonLabel="See on star map"
        highlightedItemId={
          selectedAnchor?.type === "shift" ? selectedAnchor.id : null
        }
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
  highlightedItemId,
}: {
  title: string;
  emoji?: string;
  items: TextRow[];
  recencyColor: string;
  idPrefix: string;
  buildStarMapHref?: (item: TextRow) => string;
  expandedDetailFor?: (item: TextRow) => ExpandedDetail | null;
  buttonLabel?: string;
  // When set, the matching item gets the same visual highlight that
  // :target normally applies — used when arriving from home with a
  // ?constellation=<id> param so the card lights up even though the
  // URL fragment is #constellation-map (not #bt-<id>).
  highlightedItemId?: string | null;
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
              const isHighlighted = highlightedItemId === item.id;
              return (
                <li key={item.id}>
                  <details
                    id={targetId}
                    open={isHighlighted || undefined}
                    className={
                      "group scroll-mt-20 rounded-lg border bg-white/[0.02] px-4 py-3 transition target:border-brand-primary target:bg-brand-primary/10 target:shadow-[0_0_18px_rgba(89,164,192,0.35)] " +
                      (isHighlighted
                        ? "border-brand-primary bg-brand-primary/10 shadow-[0_0_18px_rgba(89,164,192,0.35)]"
                        : "border-white/10")
                    }
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
                      {detail ? <ExpandedDetailBody detail={detail} /> : null}
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

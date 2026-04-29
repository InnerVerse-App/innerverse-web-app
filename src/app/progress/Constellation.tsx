"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";

import { formatDateCompact } from "@/lib/format";

import { ConstellationRename } from "./ConstellationRename";
import {
  type BreakthroughDot,
  type ConstellationLayout,
  type GalaxyMeta,
  type MindsetShiftDot,
  type PositionedGoal,
  type Positioned,
  type SessionDot,
} from "./constellation-layout";

type ConstellationLinkRow = {
  name: string;
  sessionIds: string[];
  shiftIds: string[];
  // Subset of sessionIds that fed the breakthrough directly (didn't
  // route through a mindset shift). Used for the layered tree
  // rendering: breakthrough → directSessions, breakthrough → shifts
  // → each shift's contributing sessions.
  directSessionIds: string[];
};

type ShiftLinkRow = {
  sessionIds: string[];
};

type GoalLinkRow = {
  sessionIds: string[];
  shiftIds: string[];
  breakthroughIds: string[];
};

type SelectedAnchor =
  | { type: "breakthrough"; id: string }
  | { type: "shift"; id: string }
  | { type: "goal"; id: string }
  | { type: "session"; id: string };

type CurrentParams = {
  demo?: string;
  constellation?: string;
  shift?: string;
  goal?: string;
  session?: string;
  window?: string;
};

type Props = {
  layout: ConstellationLayout;
  hasGoals: boolean;
  // /goals link target. Demo mode passes "/goals?demo=1".
  goalsHref?: string;
  // Map of breakthrough_id → constellation name + contributing star
  // ids. When a breakthrough is selected, lines are drawn from it to
  // those stars.
  constellationLinks?: Map<string, ConstellationLinkRow>;
  // Map of shift_id → contributing session ids.
  mindsetShiftLinks?: Map<string, ShiftLinkRow>;
  // Map of goal_id → contributing session/shift/breakthrough ids.
  goalLinks?: Map<string, GoalLinkRow>;
  // The currently-selected anchor (any of the three types). Drives
  // the line layer on the constellation panel.
  selectedAnchor?: SelectedAnchor | null;
  // URL helper inputs — current page params + base path. Constellation
  // builds its own toggle URLs from these so all params are preserved.
  basePath?: string;
  currentParams?: CurrentParams;
};

const SESSION_COLOR = "#59A4C0";
const BREAKTHROUGH_COLOR = "#DCA114";
const MINDSET_COLOR = "#A78BFA";
const GOAL_COLOR = "#4ADE80";

// Decorative far-background "stars" — fixed positions, no data meaning,
// just give the dark sky depth and a sense of life behind the data
// points. Each star carries its own twinkle parameters so the field
// pulses asymmetrically (no lockstep) and reads as alive. Size, base
// brightness, twinkle duration and delay are all hash-stable per star
// — same render across reloads. Density tuned: enough to feel like
// space, sparse enough not to compete with the data dots. The
// fixed-list layout keeps positioning deterministic without a PRNG.
const FAR_STARS: Array<{
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  twinkleMin: number;
  twinkleMax: number;
  duration: number;
  delay: number;
}> = [
  { x: 6, y: 8, size: 1, baseOpacity: 0.5, twinkleMin: 0.2, twinkleMax: 0.7, duration: 4.2, delay: 0 },
  { x: 14, y: 21, size: 1.5, baseOpacity: 0.6, twinkleMin: 0.3, twinkleMax: 0.85, duration: 5.5, delay: 1.3 },
  { x: 22, y: 5, size: 1, baseOpacity: 0.4, twinkleMin: 0.15, twinkleMax: 0.6, duration: 3.8, delay: 0.7 },
  { x: 31, y: 14, size: 2, baseOpacity: 0.7, twinkleMin: 0.4, twinkleMax: 0.95, duration: 6, delay: 2.1 },
  { x: 38, y: 28, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.5, delay: 1.7 },
  { x: 45, y: 6, size: 1.2, baseOpacity: 0.55, twinkleMin: 0.25, twinkleMax: 0.75, duration: 5.1, delay: 0.4 },
  { x: 52, y: 18, size: 1, baseOpacity: 0.4, twinkleMin: 0.2, twinkleMax: 0.6, duration: 4.8, delay: 2.5 },
  { x: 60, y: 9, size: 1.5, baseOpacity: 0.6, twinkleMin: 0.3, twinkleMax: 0.85, duration: 5.6, delay: 1.1 },
  { x: 68, y: 24, size: 1, baseOpacity: 0.5, twinkleMin: 0.2, twinkleMax: 0.7, duration: 4.3, delay: 0.9 },
  { x: 76, y: 12, size: 2.5, baseOpacity: 0.75, twinkleMin: 0.45, twinkleMax: 1, duration: 6.5, delay: 0.2 },
  { x: 84, y: 33, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.6, delay: 2.8 },
  { x: 90, y: 8, size: 1.5, baseOpacity: 0.6, twinkleMin: 0.3, twinkleMax: 0.8, duration: 5.2, delay: 1.5 },
  { x: 95, y: 22, size: 1, baseOpacity: 0.5, twinkleMin: 0.2, twinkleMax: 0.7, duration: 4.7, delay: 0.6 },
  { x: 4, y: 35, size: 1.5, baseOpacity: 0.55, twinkleMin: 0.25, twinkleMax: 0.75, duration: 5.3, delay: 1.9 },
  { x: 11, y: 48, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.4, delay: 0.3 },
  { x: 18, y: 62, size: 2, baseOpacity: 0.65, twinkleMin: 0.35, twinkleMax: 0.9, duration: 6.1, delay: 2.3 },
  { x: 26, y: 88, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.6, delay: 1.4 },
  { x: 34, y: 73, size: 1.2, baseOpacity: 0.5, twinkleMin: 0.22, twinkleMax: 0.7, duration: 5, delay: 0.8 },
  { x: 42, y: 92, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.3, delay: 2.6 },
  { x: 49, y: 65, size: 1.5, baseOpacity: 0.55, twinkleMin: 0.25, twinkleMax: 0.75, duration: 5.4, delay: 1.6 },
  { x: 56, y: 84, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.7, delay: 0.5 },
  { x: 63, y: 71, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.5, delay: 2.2 },
  { x: 71, y: 95, size: 1.5, baseOpacity: 0.6, twinkleMin: 0.3, twinkleMax: 0.85, duration: 5.7, delay: 0.9 },
  { x: 79, y: 78, size: 1, baseOpacity: 0.5, twinkleMin: 0.2, twinkleMax: 0.7, duration: 4.8, delay: 1.8 },
  { x: 86, y: 92, size: 2, baseOpacity: 0.7, twinkleMin: 0.4, twinkleMax: 0.95, duration: 6.2, delay: 0.1 },
  { x: 93, y: 68, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.4, delay: 2.7 },
  { x: 8, y: 78, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.6, delay: 1.2 },
  { x: 15, y: 95, size: 1.2, baseOpacity: 0.5, twinkleMin: 0.22, twinkleMax: 0.7, duration: 5.1, delay: 0.4 },
  { x: 17, y: 30, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.5, delay: 2.4 },
  { x: 39, y: 55, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.7, delay: 1.0 },
  { x: 67, y: 42, size: 1.5, baseOpacity: 0.6, twinkleMin: 0.3, twinkleMax: 0.8, duration: 5.5, delay: 2.0 },
  { x: 81, y: 56, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.4, delay: 0.6 },
  { x: 24, y: 50, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.9, delay: 1.7 },
  { x: 73, y: 63, size: 1, baseOpacity: 0.45, twinkleMin: 0.2, twinkleMax: 0.65, duration: 4.6, delay: 2.5 },
  { x: 47, y: 38, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.5, delay: 0.3 },
  { x: 56, y: 48, size: 1, baseOpacity: 0.4, twinkleMin: 0.18, twinkleMax: 0.6, duration: 4.7, delay: 1.4 },
];

// Dense cluster of tiny stars concentrated within the upper Milky-Way
// band (y: 5-22%). Real Milky Way photographs show dramatically higher
// star density inside the dust band than in the surrounding sky — this
// list reproduces that. Most carry a faint cyan tint (`tint: "cyan"`)
// matching the cyan-blue star color that dominates real Milky Way and
// Andromeda images; a few stay neutral white for contrast.
const BAND_STARS: Array<{
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  tint: "cyan" | "warm" | "white";
  duration: number;
  delay: number;
}> = [
  { x: 8, y: 11, size: 0.7, baseOpacity: 0.55, tint: "cyan", duration: 3.6, delay: 0.4 },
  { x: 12, y: 7, size: 0.6, baseOpacity: 0.45, tint: "white", duration: 4.1, delay: 1.2 },
  { x: 15, y: 17, size: 0.8, baseOpacity: 0.6, tint: "cyan", duration: 3.4, delay: 0.6 },
  { x: 19, y: 14, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 4.3, delay: 1.9 },
  { x: 22, y: 9, size: 1, baseOpacity: 0.7, tint: "cyan", duration: 3.8, delay: 0.2 },
  { x: 25, y: 18, size: 0.6, baseOpacity: 0.45, tint: "white", duration: 4.0, delay: 1.5 },
  { x: 28, y: 7, size: 0.7, baseOpacity: 0.55, tint: "cyan", duration: 3.7, delay: 2.1 },
  { x: 31, y: 13, size: 1.2, baseOpacity: 0.75, tint: "cyan", duration: 4.5, delay: 0.7 },
  { x: 34, y: 19, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.9, delay: 1.3 },
  { x: 37, y: 9, size: 0.7, baseOpacity: 0.55, tint: "white", duration: 4.2, delay: 0.5 },
  { x: 40, y: 16, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.5, delay: 2.3 },
  { x: 43, y: 11, size: 0.8, baseOpacity: 0.6, tint: "cyan", duration: 3.8, delay: 1.0 },
  { x: 46, y: 17, size: 0.7, baseOpacity: 0.5, tint: "cyan", duration: 4.0, delay: 0.3 },
  { x: 49, y: 8, size: 1.3, baseOpacity: 0.8, tint: "cyan", duration: 4.7, delay: 1.7 },
  { x: 52, y: 14, size: 0.6, baseOpacity: 0.45, tint: "warm", duration: 3.6, delay: 0.9 },
  { x: 55, y: 19, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 4.1, delay: 2.0 },
  { x: 58, y: 10, size: 0.7, baseOpacity: 0.55, tint: "white", duration: 3.7, delay: 0.4 },
  { x: 61, y: 16, size: 0.8, baseOpacity: 0.6, tint: "cyan", duration: 4.3, delay: 1.6 },
  { x: 64, y: 7, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.9, delay: 0.8 },
  { x: 67, y: 13, size: 1, baseOpacity: 0.7, tint: "cyan", duration: 4.4, delay: 2.2 },
  { x: 70, y: 18, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.5, delay: 0.6 },
  { x: 73, y: 9, size: 0.7, baseOpacity: 0.55, tint: "white", duration: 4.0, delay: 1.4 },
  { x: 76, y: 15, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.8, delay: 0.5 },
  { x: 79, y: 19, size: 0.8, baseOpacity: 0.6, tint: "cyan", duration: 4.2, delay: 1.8 },
  { x: 82, y: 11, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 3.6, delay: 0.2 },
  { x: 85, y: 17, size: 0.7, baseOpacity: 0.55, tint: "cyan", duration: 4.1, delay: 2.4 },
  { x: 88, y: 8, size: 0.9, baseOpacity: 0.65, tint: "cyan", duration: 4.6, delay: 1.1 },
  { x: 91, y: 14, size: 0.6, baseOpacity: 0.45, tint: "white", duration: 3.7, delay: 0.7 },
  { x: 94, y: 19, size: 0.6, baseOpacity: 0.45, tint: "cyan", duration: 4.0, delay: 1.5 },
];

const STAR_TINTS = {
  cyan: "rgb(170, 215, 255)",
  warm: "rgb(255, 230, 200)",
  white: "rgb(255, 255, 255)",
} as const;

// 8-pointed compass-rose star polygon (viewBox 0..24, outer r=10,
// inner r=4). Distinct shape from circles so breakthroughs read as
// the rare, hard-won, "shining" moments.
const STAR_POINTS =
  "12,2 13.53,8.30 19.07,4.93 15.70,10.47 22,12 15.70,13.53 19.07,19.07 13.53,15.70 12,22 10.47,15.70 4.93,19.07 8.30,13.53 2,12 8.30,10.47 4.93,4.93 10.47,8.30";

// Tap-zone padding around each star. Smaller than HIG's 44pt because
// dense galaxies have neighbors closer than 44pt apart — a wide tap
// zone causes neighbors to capture each other's hover/click. The
// visible dot itself plus a small p-1 (4px) padding gives a hit
// area large enough for finger taps in practice without crowding.
const TAP_PADDING = "p-1";

// Time-window options shown in the toggle pill row above the panel.
// Value is what gets written to ?window=<value>; the layout-level
// ageWindowDays parsing happens server-side in the page.
const WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1yr" },
  { value: "all", label: "All" },
];

export function Constellation({
  layout,
  hasGoals,
  goalsHref = "/goals",
  constellationLinks,
  mindsetShiftLinks,
  goalLinks,
  selectedAnchor = null,
  basePath = "/progress",
  currentParams = {},
}: Props) {
  const selectedBreakthroughId =
    selectedAnchor?.type === "breakthrough" ? selectedAnchor.id : null;

  // Center the active constellation pill in its scroll container so
  // selecting from the home tab (or any constellation off-screen)
  // lands the pill in view automatically.
  const activePillRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (!selectedBreakthroughId) return;
    activePillRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedBreakthroughId]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  const isEmpty =
    layout.sessions.length === 0 &&
    layout.breakthroughs.length === 0 &&
    layout.mindsetShifts.length === 0 &&
    layout.goals.length === 0;

  // Build a chronological "path of progression" through whichever
  // anchor is selected (breakthrough / mindset shift / goal). Each
  // contributing star ordered by when it happened, with the anchor
  // itself as the final point.
  const selectedConstellationLinks =
    selectedAnchor?.type === "breakthrough" && constellationLinks
      ? constellationLinks.get(selectedAnchor.id) ?? null
      : null;
  // Members of the selected constellation get an opacity boost so
  // they stay visible even when the constellation includes old
  // contributors that would otherwise be at the recency floor.
  const boostedIds = new Set<string>();
  // Explicit "from → to" edges. Lets the renderer draw a layered
  // tree (e.g. breakthrough → shift → shift's session) instead of a
  // flat anchor-to-everything fan.
  type ChainEdge = { fromX: number; fromY: number; toX: number; toY: number };
  const chainEdges: ChainEdge[] = [];
  // All distinct points in the chain — used for the auto-zoom
  // bounding box. Includes the anchor.
  const chainPoints: Array<{ x: number; y: number; t: number }> = [];
  if (selectedAnchor) {
    const sessionById = new Map(layout.sessions.map((s) => [s.id, s]));
    const shiftById = new Map(layout.mindsetShifts.map((m) => [m.id, m]));
    const goalById = new Map(layout.goals.map((g) => [g.id, g]));
    const breakthroughById = new Map(
      layout.breakthroughs.map((b) => [b.id, b]),
    );

    let anchorPoint: { x: number; y: number; t: number } | null = null;

    function pushPoint(x: number, y: number, t: number) {
      chainPoints.push({ x, y, t });
    }
    function pushEdge(
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
    ) {
      chainEdges.push({ fromX, fromY, toX, toY });
    }

    if (selectedAnchor.type === "breakthrough") {
      const b = breakthroughById.get(selectedAnchor.id);
      const links = constellationLinks?.get(selectedAnchor.id);
      if (b && links) {
        anchorPoint = {
          x: b.x * 100,
          y: b.y * 100,
          t: Date.parse(b.createdAt),
        };
        pushPoint(anchorPoint.x, anchorPoint.y, anchorPoint.t);
        boostedIds.add(b.id);
        // Boost ALL galaxy members so the whole constellation
        // brightens, even though most reach the breakthrough
        // through shifts (not direct lines).
        for (const id of links.sessionIds) boostedIds.add(id);
        for (const id of links.shiftIds) boostedIds.add(id);

        // Conservative line caps so the constellation reads as the
        // narrative arc, not every-thing-that-may-have-contributed.
        // Will be replaced by LLM-emitted influence scores in V.5a;
        // until then, "most recent" is the heuristic for primacy.
        const MAX_DIRECT_SESSION_LINES = 1;
        const MAX_SHIFT_LINES = 2;
        const MAX_SESSIONS_PER_SHIFT = 1;

        // Direct sessions: keep the most recent only.
        const directSorted = links.directSessionIds
          .map((sid) => sessionById.get(sid))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .sort(
            (a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt),
          )
          .slice(0, MAX_DIRECT_SESSION_LINES);
        for (const s of directSorted) {
          const sx = s.x * 100;
          const sy = s.y * 100;
          pushEdge(anchorPoint.x, anchorPoint.y, sx, sy);
          pushPoint(sx, sy, Date.parse(s.endedAt));
        }

        // Shifts: keep the most recent few; for each, draw a line
        // to its single most recent contributing session.
        const shiftsSorted = links.shiftIds
          .map((mid) => shiftById.get(mid))
          .filter((m): m is NonNullable<typeof m> => !!m)
          .sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          )
          .slice(0, MAX_SHIFT_LINES);
        for (const m of shiftsSorted) {
          const mx = m.x * 100;
          const my = m.y * 100;
          pushEdge(anchorPoint.x, anchorPoint.y, mx, my);
          pushPoint(mx, my, Date.parse(m.createdAt));
          const sl = mindsetShiftLinks?.get(m.id);
          if (sl) {
            const shiftSessionsSorted = sl.sessionIds
              .map((sid) => sessionById.get(sid))
              .filter((s): s is NonNullable<typeof s> => !!s)
              .sort(
                (a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt),
              )
              .slice(0, MAX_SESSIONS_PER_SHIFT);
            for (const ss of shiftSessionsSorted) {
              const sx = ss.x * 100;
              const sy = ss.y * 100;
              pushEdge(mx, my, sx, sy);
              pushPoint(sx, sy, Date.parse(ss.endedAt));
            }
          }
        }

        // Goals are NOT drawn into a constellation — comets wander
        // the universe, they don't belong to a single breakthrough's
        // galaxy. The connection still exists in the data (a goal
        // can still list this breakthrough as a contributor) and
        // shows up as a line when the GOAL is selected; we just
        // don't fan from a chosen breakthrough out to its comets.
      }
    } else if (selectedAnchor.type === "shift") {
      const m = shiftById.get(selectedAnchor.id);
      const links = mindsetShiftLinks?.get(selectedAnchor.id);
      if (m && links) {
        anchorPoint = {
          x: m.x * 100,
          y: m.y * 100,
          t: Date.parse(m.createdAt),
        };
        pushPoint(anchorPoint.x, anchorPoint.y, anchorPoint.t);
        boostedIds.add(m.id);

        // Sessions that fed this shift.
        for (const sid of links.sessionIds) {
          const s = sessionById.get(sid);
          if (!s) continue;
          const sx = s.x * 100;
          const sy = s.y * 100;
          pushEdge(anchorPoint.x, anchorPoint.y, sx, sy);
          pushPoint(sx, sy, Date.parse(s.endedAt));
          boostedIds.add(sid);
        }

        // Parent breakthroughs (the shift fed them).
        if (constellationLinks) {
          for (const [bid, bl] of constellationLinks) {
            if (!bl.shiftIds.includes(selectedAnchor.id)) continue;
            const bb = breakthroughById.get(bid);
            if (!bb) continue;
            const bx = bb.x * 100;
            const by = bb.y * 100;
            pushEdge(anchorPoint.x, anchorPoint.y, bx, by);
            pushPoint(bx, by, Date.parse(bb.createdAt));
            boostedIds.add(bid);
          }
        }

        // Goals that include this shift.
        if (goalLinks) {
          for (const [gid, gl] of goalLinks) {
            if (!gl.shiftIds.includes(selectedAnchor.id)) continue;
            const g = goalById.get(gid);
            if (!g) continue;
            const gx = g.x * 100;
            const gy = g.y * 100;
            pushEdge(anchorPoint.x, anchorPoint.y, gx, gy);
            pushPoint(gx, gy, Date.parse(g.lastEngagedAt ?? m.createdAt));
            boostedIds.add(gid);
          }
        }
      }
    } else if (selectedAnchor.type === "goal") {
      const g = goalById.get(selectedAnchor.id);
      const links = goalLinks?.get(selectedAnchor.id);
      if (g && g.lastEngagedAt && links) {
        anchorPoint = {
          x: g.x * 100,
          y: g.y * 100,
          t: Date.parse(g.lastEngagedAt),
        };
        pushPoint(anchorPoint.x, anchorPoint.y, anchorPoint.t);
        boostedIds.add(g.id);
        for (const sid of links.sessionIds) {
          const s = sessionById.get(sid);
          if (!s) continue;
          pushEdge(anchorPoint.x, anchorPoint.y, s.x * 100, s.y * 100);
          pushPoint(s.x * 100, s.y * 100, Date.parse(s.endedAt));
          boostedIds.add(sid);
        }
        for (const mid of links.shiftIds) {
          const m = shiftById.get(mid);
          if (!m) continue;
          pushEdge(anchorPoint.x, anchorPoint.y, m.x * 100, m.y * 100);
          pushPoint(m.x * 100, m.y * 100, Date.parse(m.createdAt));
          boostedIds.add(mid);
        }
        for (const bid of links.breakthroughIds) {
          const bb = breakthroughById.get(bid);
          if (!bb) continue;
          pushEdge(anchorPoint.x, anchorPoint.y, bb.x * 100, bb.y * 100);
          pushPoint(bb.x * 100, bb.y * 100, Date.parse(bb.createdAt));
          boostedIds.add(bid);
        }
      }
    } else if (selectedAnchor.type === "session") {
      const s = sessionById.get(selectedAnchor.id);
      if (s) {
        anchorPoint = {
          x: s.x * 100,
          y: s.y * 100,
          t: Date.parse(s.endedAt),
        };
        pushPoint(anchorPoint.x, anchorPoint.y, anchorPoint.t);
        boostedIds.add(s.id);
        const sid = selectedAnchor.id;
        // Breakthroughs this session contributed to (full set, not
        // just direct). Pills on the session card include any
        // breakthrough where the session is in contributing_session_ids
        // OR direct_session_ids OR is the source — drawing the same
        // edges keeps the map and the pills in sync.
        if (constellationLinks) {
          for (const [bid, links] of constellationLinks) {
            if (!links.sessionIds.includes(sid)) continue;
            const bb = breakthroughById.get(bid);
            if (!bb) continue;
            pushEdge(anchorPoint.x, anchorPoint.y, bb.x * 100, bb.y * 100);
            pushPoint(bb.x * 100, bb.y * 100, Date.parse(bb.createdAt));
            boostedIds.add(bid);
          }
        }
        // Shifts this session fed.
        if (mindsetShiftLinks) {
          for (const [mid, links] of mindsetShiftLinks) {
            if (!links.sessionIds.includes(sid)) continue;
            const m = shiftById.get(mid);
            if (!m) continue;
            pushEdge(anchorPoint.x, anchorPoint.y, m.x * 100, m.y * 100);
            pushPoint(m.x * 100, m.y * 100, Date.parse(m.createdAt));
            boostedIds.add(mid);
          }
        }
        // Goals this session contributed to.
        if (goalLinks) {
          for (const [gid, links] of goalLinks) {
            if (!links.sessionIds.includes(sid)) continue;
            const g = goalById.get(gid);
            if (!g) continue;
            pushEdge(anchorPoint.x, anchorPoint.y, g.x * 100, g.y * 100);
            pushPoint(
              g.x * 100,
              g.y * 100,
              Date.parse(g.lastEngagedAt ?? s.endedAt),
            );
            boostedIds.add(gid);
          }
        }
      }
    }

  }
  // Keep the old name for the rename-component reference below.
  const selectedLinks = selectedConstellationLinks;

  // Auto-zoom the constellation panel to fit the selected constellation.
  // Only fires on initial page mount when the URL hash matches the
  // selected anchor (i.e., the user navigated TO this anchor from a
  // pill elsewhere — `/progress?constellation=X#bt-X`). Subsequent
  // dot taps within /progress change the URL without that hash, so
  // the user's manual pinch-zoom is preserved on mobile.
  //
  // The reset-to-default-on-deselect path (clicking a clear button
  // or selecting nothing) is also gated on the hash so we don't
  // yank the user's zoom out from under them.
  const chainKey = chainPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("|");
  const didInitialAutoZoomRef = useRef(false);
  useEffect(() => {
    if (didInitialAutoZoomRef.current) return;
    if (typeof window === "undefined") return;
    if (!selectedAnchor) return;
    const expectedHash =
      selectedAnchor.type === "breakthrough"
        ? `#bt-${selectedAnchor.id}`
        : selectedAnchor.type === "shift"
          ? `#ms-${selectedAnchor.id}`
          : selectedAnchor.type === "session"
            ? `#s-${selectedAnchor.id}`
            : selectedAnchor.type === "goal"
              ? `#g-${selectedAnchor.id}`
              : null;
    if (!expectedHash) return;
    if (window.location.hash !== expectedHash) return;
    const ctrl = transformRef.current;
    const panel = panelRef.current;
    if (!ctrl || !panel) return;
    if (chainPoints.length < 2) return;
    const rect = panel.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of chainPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const bboxWPx = ((maxX - minX) / 100) * w;
    const bboxHPx = ((maxY - minY) / 100) * h;
    const padding = 1.6;
    const desiredScale = Math.min(
      8,
      Math.max(
        1,
        Math.min(w, h) / Math.max(bboxWPx * padding, bboxHPx * padding, 1),
      ),
    );
    const centerXFrac = (minX + maxX) / 200;
    const centerYFrac = (minY + maxY) / 200;
    const translateX = w / 2 - centerXFrac * w * desiredScale;
    const translateY = h / 2 - centerYFrac * h * desiredScale;
    ctrl.setTransform(translateX, translateY, desiredScale, 450);
    didInitialAutoZoomRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnchor?.type, selectedAnchor?.id, chainKey]);

  // URL helper — merge overrides into currentParams, then back into a
  // query string. Pass null to clear a param. Used by every toggle
  // pill so the user can switch one knob without losing the others.
  function buildUrl(overrides: Partial<Record<keyof CurrentParams, string | null>>): string {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentParams)) {
      if (typeof v === "string") merged[k] = v;
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) delete merged[k];
      else if (v !== undefined) merged[k] = v;
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `${basePath}?${qs}#constellation-map` : `${basePath}#constellation-map`;
  }

  const currentWindow = currentParams.window ?? "30";

  return (
    <section id="constellation-map" className="mt-6 scroll-mt-4">
      <h2 className="text-base font-semibold text-white">Your Constellation</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Your growth radiating outward. The center is now; older stars
        sit farther out. Pinch to zoom in on a busy area.
      </p>

      {/* Time-window pill row */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Window
        </span>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((opt) => {
            const isActive = currentWindow === opt.value;
            return (
              <Link
                key={opt.value}
                href={buildUrl({ window: opt.value })}
                className={
                  "rounded-full border px-2.5 py-0.5 text-[11px] transition " +
                  (isActive
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-white/10 text-neutral-400 hover:text-neutral-200")
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {constellationLinks && layout.breakthroughs.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">
            Constellations
          </p>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-2">
              <Link
                href={buildUrl({ constellation: null })}
                className={
                  "shrink-0 rounded-full border px-3 py-1 text-xs transition " +
                  (selectedBreakthroughId === null
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-white/10 text-neutral-400 hover:border-white/30 hover:text-neutral-200")
                }
              >
                Off
              </Link>
              {layout.breakthroughs.map((b) => {
                const isActive = selectedBreakthroughId === b.id;
                const links = constellationLinks?.get(b.id);
                const pillLabel = links?.name ?? b.content;
                return (
                  <Link
                    key={b.id}
                    ref={isActive ? activePillRef : undefined}
                    href={buildUrl({ constellation: b.id })}
                    title={`${pillLabel} — ${b.content}`}
                    className={
                      "shrink-0 rounded-full border px-3 py-1 text-xs transition " +
                      (isActive
                        ? "text-white"
                        : "border-white/10 text-neutral-400 hover:text-neutral-200")
                    }
                    style={
                      isActive
                        ? {
                            borderColor: `${BREAKTHROUGH_COLOR}80`,
                            background: `${BREAKTHROUGH_COLOR}1a`,
                            boxShadow: `0 0 8px ${BREAKTHROUGH_COLOR}40`,
                          }
                        : undefined
                    }
                  >
                    {pillLabel}
                  </Link>
                );
              })}
            </div>
          </div>
          {selectedBreakthroughId && selectedLinks ? (
            <ConstellationRename
              breakthroughId={selectedBreakthroughId}
              initialName={selectedLinks.name}
            />
          ) : null}
        </div>
      ) : null}

      <div
        ref={panelRef}
        className="relative mt-4 aspect-square w-full overflow-hidden rounded-xl"
        style={{
          // Multi-layer cosmic atmosphere. All radial-gradients live on
          // the panel's (un-transformed) background, so they survive the
          // zoom/pan stack cleanly — the previous Milky Way attempt put
          // a blurred element inside the TransformComponent and got
          // clipped into a hard rectangle. Painted top → bottom:
          //   1. Three overlapping ellipses across the top ~15% form a
          //      Milky-Way-style stellar band (magenta → violet → blue)
          //      that stays well above the central data cluster.
          //   2. A wide thin lower-edge dust hint to balance.
          //   3. Side wisps at the left + right edges for atmospheric
          //      depth.
          //   4. Existing center + corner blue glows (amped slightly).
          //   5. Base dark teal gradient.
          background: [
            // Milky-Way upper band (three overlapping ellipses give it
            // an organic, non-rectangular silhouette). Opacities tuned
            // up vs the first cosmic-atmosphere pass to match the
            // pink/violet richness of the operator's reference photos.
            "radial-gradient(ellipse 28% 9% at 28% 12%, rgba(186,104,200,0.30) 0%, transparent 75%)",
            "radial-gradient(ellipse 32% 10% at 56% 10%, rgba(167,139,250,0.34) 0%, transparent 75%)",
            "radial-gradient(ellipse 26% 8% at 82% 14%, rgba(120,160,220,0.26) 0%, transparent 75%)",
            // Lower-edge dust hint.
            "radial-gradient(ellipse 50% 12% at 50% 92%, rgba(167,139,250,0.16) 0%, transparent 80%)",
            // Side wisps.
            "radial-gradient(ellipse 18% 32% at 6% 55%, rgba(186,104,200,0.14) 0%, transparent 70%)",
            "radial-gradient(ellipse 18% 32% at 96% 70%, rgba(89,140,200,0.16) 0%, transparent 70%)",
            // Existing center + corner blue glows (slightly amped).
            "radial-gradient(circle at center, rgba(89,164,192,0.14) 0%, transparent 38%)",
            "radial-gradient(ellipse at 75% 25%, rgba(89,164,192,0.07) 0%, transparent 50%)",
            "radial-gradient(ellipse at 25% 75%, rgba(89,164,192,0.06) 0%, transparent 50%)",
            // Base.
            "radial-gradient(circle at center, #02101c 0%, #00050a 80%)",
          ].join(", "),
          touchAction: "none",
        }}
      >
        {/* Selection label — shows the title of the currently-selected
            dot. Single-tap on mobile doesn't trigger HTML title hover,
            so this is the only way to confirm what was tapped. */}
        <SelectionLabel
          selectedAnchor={selectedAnchor}
          layout={layout}
        />
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={1}
          maxScale={10}
          // Update --zoom-counter (= 1/scale, for counter-scaling
          // stars to stay crisp) and --zoom-scale (= scale itself,
          // used by the zoom-fade-in class so contributor stars
          // appear only as the user zooms in past the universe view).
          onTransform={(_ref, state) => {
            const el = panelRef.current;
            if (!el) return;
            el.style.setProperty("--zoom-counter", String(1 / state.scale));
            el.style.setProperty("--zoom-scale", String(state.scale));
          }}
          // Wheel zooms when the cursor is over the panel. Tiny step
          // (~1% per notch) so the user can glide in slowly rather
          // than leap.
          wheel={{ disabled: false, step: 0.01 }}
          pinch={{ disabled: false, step: 5 }}
          panning={{ disabled: false, velocityDisabled: true }}
          // Double-click is reserved for star navigation (e.g.
          // double-click a breakthrough to scroll to its detail
          // card). Disabling the wrapper's built-in zoom-toggle so
          // it doesn't fire alongside the per-star handler.
          doubleClick={{ disabled: true }}
          limitToBounds={true}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <div className="relative h-full w-full">
                  {/* Shared soft-halo radial gradients. Each star
                      renders as a solid colored circle with a larger,
                      fading halo behind it — gives crisp, distinct
                      circles with a soft atmospheric glow rather
                      than the gradient-shaded "sphere" look that
                      reads as a fuzzy bokeh ring at high zoom. */}
                  <svg
                    className="pointer-events-none absolute h-0 w-0"
                    aria-hidden
                  >
                    <defs>
                      <radialGradient id="halo-session">
                        <stop
                          offset="0%"
                          stopColor={SESSION_COLOR}
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="55%"
                          stopColor={SESSION_COLOR}
                          stopOpacity={0.18}
                        />
                        <stop
                          offset="100%"
                          stopColor={SESSION_COLOR}
                          stopOpacity={0}
                        />
                      </radialGradient>
                      <radialGradient id="halo-shift">
                        <stop
                          offset="0%"
                          stopColor={MINDSET_COLOR}
                          stopOpacity={0.6}
                        />
                        <stop
                          offset="55%"
                          stopColor={MINDSET_COLOR}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor={MINDSET_COLOR}
                          stopOpacity={0}
                        />
                      </radialGradient>
                      <radialGradient id="halo-sun">
                        <stop
                          offset="0%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.85}
                        />
                        <stop
                          offset="35%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.45}
                        />
                        <stop
                          offset="70%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="100%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                      </radialGradient>
                      {/* Diffraction-spike gradients — fade from
                          transparent at the tips through bright at
                          the center, simulating the cross-flare real
                          bright stars exhibit in long-exposure
                          astrophotography. Used only on the
                          breakthrough sun (rare, special). */}
                      <linearGradient
                        id="spike-h"
                        x1="0%"
                        y1="50%"
                        x2="100%"
                        y2="50%"
                      >
                        <stop
                          offset="0%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                        <stop
                          offset="50%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="100%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="spike-v"
                        x1="50%"
                        y1="0%"
                        x2="50%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                        <stop
                          offset="50%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="100%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <radialGradient id="halo-goal">
                        <stop
                          offset="0%"
                          stopColor={GOAL_COLOR}
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="55%"
                          stopColor={GOAL_COLOR}
                          stopOpacity={0.18}
                        />
                        <stop
                          offset="100%"
                          stopColor={GOAL_COLOR}
                          stopOpacity={0}
                        />
                      </radialGradient>
                    </defs>
                  </svg>
                  {FAR_STARS.map((s, i) => {
                    // Brightest stars (size >= 2) get a subtle box-shadow
                    // halo so they read as "named bright stars" against
                    // the field — small but visible scale of the same
                    // luminous-point treatment the data dots have.
                    const isHighlight = s.size >= 2;
                    return (
                      <span
                        key={`bg-${i}`}
                        className="star-twinkle absolute rounded-full bg-white"
                        style={
                          {
                            left: `${s.x}%`,
                            top: `${s.y}%`,
                            width: `${s.size}px`,
                            height: `${s.size}px`,
                            "--twinkle-min": s.twinkleMin,
                            "--twinkle-max": s.twinkleMax,
                            "--twinkle-duration": `${s.duration}s`,
                            "--twinkle-delay": `${s.delay}s`,
                            boxShadow: isHighlight
                              ? "0 0 3px rgba(255,255,255,0.8), 0 0 8px rgba(170,215,255,0.5)"
                              : undefined,
                          } as React.CSSProperties
                        }
                        aria-hidden
                      />
                    );
                  })}
                  {/* Dense band-region stars. These cluster within the
                      upper Milky-Way band overlay, reproducing the
                      higher star density real Milky Way photographs
                      show *inside* the dust band vs the surrounding
                      sky. Cyan-tinted majority + warmer/white minority
                      for color variety. */}
                  {BAND_STARS.map((s, i) => (
                    <span
                      key={`band-${i}`}
                      className="star-twinkle absolute rounded-full"
                      style={
                        {
                          left: `${s.x}%`,
                          top: `${s.y}%`,
                          width: `${s.size}px`,
                          height: `${s.size}px`,
                          backgroundColor: STAR_TINTS[s.tint],
                          "--twinkle-min": s.baseOpacity * 0.4,
                          "--twinkle-max": s.baseOpacity,
                          "--twinkle-duration": `${s.duration}s`,
                          "--twinkle-delay": `${s.delay}s`,
                        } as React.CSSProperties
                      }
                      aria-hidden
                    />
                  ))}

                  {/* Galaxy nebula glows. Rendered behind everything
                      else so the sun (breakthrough star) and member
                      stars (sessions, shifts) sit on top. Soft radial
                      gradient with no hard edge — the user explicitly
                      asked for "no hard boundaries". */}
                  {layout.galaxies.map((g) => (
                    <GalaxyGlow key={`glow-${g.breakthroughId}`} galaxy={g} />
                  ))}

                  {chainEdges.length > 0 ? (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      {/* Each edge is an explicit from→to pair, so a
                          breakthrough's constellation reads as a tree
                          (breakthrough → shift → shift's session)
                          rather than a flat fan. Constellation lines
                          (when a breakthrough is the anchor) draw
                          slightly heavier than connector lines for
                          shifts/sessions/goals so the galaxy reads
                          as the dominant structure. */}
                      {chainEdges.map((e, i) => {
                        const isConstellation =
                          selectedAnchor?.type === "breakthrough";
                        return (
                          <line
                            key={i}
                            x1={e.fromX}
                            y1={e.fromY}
                            x2={e.toX}
                            y2={e.toY}
                            stroke="white"
                            strokeWidth={isConstellation ? 0.55 : 0.3}
                            strokeOpacity={isConstellation ? 0.65 : 0.5}
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            style={{
                              filter:
                                "drop-shadow(0 0 1px rgba(255,255,255,0.5))",
                            }}
                          />
                        );
                      })}
                    </svg>
                  ) : null}

                  <span
                    className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      boxShadow: "0 0 3px rgba(255,255,255,0.35)",
                      transform:
                        "translate(-50%, -50%) scale(var(--zoom-counter, 1))",
                    }}
                    aria-hidden
                  />

                  {/* Cross-galaxy chain — chronological line through
                      every breakthrough (the "spine of growth").
                      Heuristic stand-in for "most significant impact"
                      until real influence scoring lands in V.5a. */}
                  {layout.breakthroughs.length >= 2 ? (
                    <CrossGalaxyChain breakthroughs={layout.breakthroughs} />
                  ) : null}

                  {/* Sessions + shifts share a fade-in wrapper so they
                      only become visible once the user has zoomed in
                      past the universe view. At full zoom-out the user
                      sees galaxy glows and suns, not individual stars.
                      Render order: smaller-first / larger-last so the
                      visually-dominant dots (sun, comet head) sit on
                      top — but the larger dots have tightened hit
                      areas so they don't over-cover their smaller
                      neighbors. */}
                  <div className="constellation-zoom-fade-in absolute inset-0">
                    {layout.mindsetShifts.map((m) => (
                      <MindsetShiftStar
                        key={m.id}
                        dot={
                          boostedIds.has(m.id) ? { ...m, opacity: 1 } : m
                        }
                        buildHref={(id) =>
                          buildUrl({ shift: id, constellation: null, goal: null })
                        }
                      />
                    ))}
                    {layout.sessions.map((s) => (
                      <SessionStar
                        key={s.id}
                        dot={
                          boostedIds.has(s.id) ? { ...s, opacity: 1 } : s
                        }
                        buildSessionHref={(id) =>
                          // Stay on /progress and select the session as
                          // the anchor — same UX as clicking any other
                          // dot. To open the session detail page, the
                          // user can use the Sessions tab.
                          buildUrl({
                            session: id,
                            constellation: null,
                            shift: null,
                            goal: null,
                          })
                        }
                      />
                    ))}
                  </div>

                  {layout.goals.map((g) => (
                    <GoalComet
                      key={g.id}
                      dot={
                        boostedIds.has(g.id) ? { ...g, opacity: 1 } : g
                      }
                      buildGoalHref={(id) =>
                        // Single-tap selects the goal as anchor on the
                        // map. Existing /goals tab is the path to the
                        // goal's full detail.
                        buildUrl({
                          goal: id,
                          constellation: null,
                          shift: null,
                          session: null,
                        })
                      }
                    />
                  ))}
                  {layout.breakthroughs.map((b) => (
                    <BreakthroughSun
                      key={b.id}
                      dot={
                        boostedIds.has(b.id) ? { ...b, opacity: 1 } : b
                      }
                      buildHref={(id) =>
                        buildUrl({ constellation: id, shift: null, goal: null })
                      }
                    />
                  ))}

                  {isEmpty ? (
                    <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                      <p className="text-sm text-neutral-400">
                        {hasGoals
                          ? "Your constellation will form as you complete coaching sessions."
                          : "Start a coaching session and your constellation will begin to form."}
                      </p>
                    </div>
                  ) : null}
                </div>
              </TransformComponent>

              {/* Zoom controls — overlayed in the panel's bottom-right
                  corner. + zoom in, − zoom out, ◯ reset. Click targets
                  are large enough for thumb taps; on mobile pinch is
                  the primary gesture and these are a fallback. */}
              <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-3">
                <div className="pointer-events-auto flex flex-col gap-1.5 rounded-md border border-white/10 bg-black/40 p-1 backdrop-blur-sm">
                  <ZoomButton onClick={() => zoomIn()} ariaLabel="Zoom in">
                    +
                  </ZoomButton>
                  <ZoomButton onClick={() => zoomOut()} ariaLabel="Zoom out">
                    −
                  </ZoomButton>
                  <ZoomButton onClick={() => resetTransform()} ariaLabel="Reset zoom">
                    <span className="text-[10px]">⟲</span>
                  </ZoomButton>
                </div>
              </div>
            </>
          )}
        </TransformWrapper>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <Legend color={SESSION_COLOR} label="Session" size={8} />
        <Legend color={GOAL_COLOR} label="Goal" size={9} />
        <Legend color={MINDSET_COLOR} label="Mindset shift" size={10} />
        <Legend color={BREAKTHROUGH_COLOR} label="Breakthrough" size={14} />
      </div>
    </section>
  );
}

function SelectionLabel({
  selectedAnchor,
  layout,
}: {
  selectedAnchor: SelectedAnchor | null | undefined;
  layout: ConstellationLayout;
}) {
  if (!selectedAnchor) return null;
  let text: string | null = null;
  if (selectedAnchor.type === "session") {
    const s = layout.sessions.find((x) => x.id === selectedAnchor.id);
    if (s) {
      const date = formatDateCompact(s.endedAt);
      text = s.title ? `${s.title} · ${date}` : `Session · ${date}`;
    }
  } else if (selectedAnchor.type === "shift") {
    const m = layout.mindsetShifts.find((x) => x.id === selectedAnchor.id);
    text = m?.content ?? null;
  } else if (selectedAnchor.type === "breakthrough") {
    const b = layout.breakthroughs.find((x) => x.id === selectedAnchor.id);
    text = b?.galaxyName?.trim() || b?.content || null;
  } else if (selectedAnchor.type === "goal") {
    const g = layout.goals.find((x) => x.id === selectedAnchor.id);
    text = g?.title ?? null;
  }
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4">
      <div className="max-w-full truncate rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
        {text}
      </div>
    </div>
  );
}

function ZoomButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-7 w-7 items-center justify-center rounded text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function SessionStar({
  dot,
  buildSessionHref,
}: {
  dot: Positioned<SessionDot>;
  buildSessionHref: (id: string) => string;
}) {
  const router = useRouter();
  const dateLabel = formatDateCompact(dot.endedAt);
  // Single-click: highlight on the constellation map (Link href).
  // Double-click: jump to the Sessions tab with this session
  // highlighted in the list, NOT to the full session chat. Symmetric
  // with BreakthroughSun (scroll to detail card) and GoalComet
  // (jump to Goals tab) — every star's double-click takes you to
  // the item's "home" with it highlighted, never to its raw chat.
  return (
    <Link
      href={buildSessionHref(dot.id)}
      aria-label={
        dot.title
          ? `${dot.title} — ${dateLabel} (double-click to view in Sessions tab)`
          : `Session from ${dateLabel} (double-click to view in Sessions tab)`
      }
      title={
        dot.title
          ? `${dot.title} — ${dateLabel}`
          : `Session — ${dateLabel}`
      }
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/sessions?session=${dot.id}#s-${dot.id}`);
      }}
    >
      <svg
        viewBox="-8 -8 16 16"
        className="block h-4 w-4 transition hover:scale-150"
        style={{ overflow: "visible" }}
        aria-hidden
      >
        <circle r={7} fill="url(#halo-session)" />
        <circle r={2.4} fill={SESSION_COLOR} />
      </svg>
    </Link>
  );
}

// The sun at the center of a galaxy. Larger and brighter than a
// session/shift star — a solid yellow disc with a wider, warmer
// halo behind it. The galaxy's nebula glow is rendered separately
// (see GalaxyGlow); this is just the sun's body + its own halo.
//
// Single-click selects this breakthrough as the anchor (via the
// Link href). Double-click scrolls the page to this breakthrough's
// detail card below the constellation map — that's "go to the
// actual breakthrough" per the operator's spec.
function BreakthroughSun({
  dot,
  buildHref,
}: {
  dot: Positioned<BreakthroughDot>;
  buildHref: (id: string) => string;
}) {
  // Split into two layered elements: the halo is a sibling with
  // pointer-events-none so it never intercepts taps for nearby
  // session/shift dots clustered around the sun. The Link wraps
  // only the disc-sized SVG, so the breakthrough's tap target is
  // ~h-5 w-5 (20px) instead of the h-7 w-7 (28px) the halo needs.
  // Keeps the visible look identical (the disc SVG still has
  // overflow:visible so the disc renders at the right size) while
  // freeing up the surrounding pixels for clicks on neighbors.
  const positionStyle = {
    left: `${dot.x * 100}%`,
    top: `${dot.y * 100}%`,
    opacity: dot.opacity,
  } as const;
  return (
    <>
      <span
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={positionStyle}
        aria-hidden
      >
        <svg
          viewBox="-12 -12 24 24"
          className="block h-7 w-7"
          style={{ overflow: "visible" }}
        >
          {/* Diffraction-spike cross-flare. Renders BEHIND the halo
              and disc so the bright core stays crisp. Lines extend
              well beyond the viewBox via overflow:visible. Only on
              the breakthrough sun — keeps it iconic and rare. */}
          <line
            x1={-32}
            y1={0}
            x2={32}
            y2={0}
            stroke="url(#spike-h)"
            strokeWidth={0.7}
          />
          <line
            x1={0}
            y1={-32}
            x2={0}
            y2={32}
            stroke="url(#spike-v)"
            strokeWidth={0.7}
          />
          <circle r={11} fill="url(#halo-sun)" />
        </svg>
      </span>
      <Link
        href={buildHref(dot.id)}
        // scroll={false} stops Next.js from scrolling to the URL's
        // #constellation-map fragment on every click. Without this,
        // a double-click first scrolls to the breakthrough's detail
        // card (via onDoubleClick below) and then snaps back up to
        // the constellation map when the second click's URL change
        // re-applies the fragment scroll.
        scroll={false}
        aria-label={`Breakthrough: ${dot.galaxyName || dot.content}`}
        title={`Breakthrough — ${dot.galaxyName || dot.content}`}
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={positionStyle}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = document.getElementById(`bt-${dot.id}`);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }}
      >
        <svg
          viewBox="-8 -8 16 16"
          className="block h-5 w-5 transition hover:scale-125"
          aria-hidden
        >
          <circle r={4.5} fill={BREAKTHROUGH_COLOR} />
        </svg>
      </Link>
    </>
  );
}

// Galaxy atmospheric glow — very faint, barely-visible white haze
// around the sun. The galaxy's IDENTITY comes from the cluster of
// stars, not the glow; the glow just gives the impression of an
// unresolved disc behind them. No more orange-nebula bleed.
// Stable per-galaxy tilt so each formed galaxy has its own visual
// orientation in the sky. FNV-1a-ish 32-bit string hash → 0..179
// degrees. Range capped at 180 because an axis-symmetric ellipse
// rotated by 180+x looks identical to one rotated by x.
function galaxyTiltDeg(breakthroughId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < breakthroughId.length; i++) {
    h ^= breakthroughId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 180;
}

// Faint elliptical galactic disc behind each formed galaxy. Aspect
// ratio ~3:1 (a spiral seen at a steeper viewing angle), rotated at
// a hash-stable angle so neighboring galaxies look distinct. Three
// layered radial gradients reproduce the three traits real spiral
// galaxies share in long-exposure photography:
//   1. A bright concentrated warm bulge at the core (yellow-orange).
//   2. A pink/magenta mid-disc highlight evoking spiral arms +
//      star-formation regions (the pink streaks visible in M81 and
//      Andromeda photos).
//   3. A wide, faint cool blue/violet disc fading to transparent at
//      the rim.
// Renders behind everything; sun + member dots + connection lines
// all sit on top, so the data layer remains the focal point.
function GalaxyGlow({ galaxy }: { galaxy: GalaxyMeta }) {
  const widthPct = galaxy.radius * 100 * 3.2;
  const heightPct = galaxy.radius * 100 * 1.1;
  const tilt = galaxyTiltDeg(galaxy.breakthroughId);
  return (
    <span
      className="pointer-events-none absolute"
      style={{
        left: `${galaxy.centerX * 100}%`,
        top: `${galaxy.centerY * 100}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
        backgroundImage: [
          // Bright warm bulge — bumped up vs PR #157 so it concentrates
          // around the sun like a real galactic core. Tighter falloff
          // (50% by 25%) keeps it crisp against the surrounding disc.
          "radial-gradient(ellipse 28% 55% at center, rgba(255,200,90,0.30) 0%, rgba(220,161,20,0.14) 25%, transparent 60%)",
          // Pink/magenta arm-region highlight — mid-disc, ring-shaped
          // (note the inner stop at 30% is transparent so it forms an
          // annulus around the bulge, evoking spiral arms + star-
          // formation regions instead of bleeding into the bulge).
          "radial-gradient(ellipse 75% 90% at center, transparent 25%, rgba(186,104,200,0.10) 45%, rgba(167,139,250,0.06) 65%, transparent 85%)",
          // Cool blue/violet outer disc — widest layer, fades to
          // transparent at the rim so neighboring galaxies / the
          // in-progress region don't bleed together.
          "radial-gradient(ellipse 100% 100% at center, rgba(89,140,200,0.10) 0%, rgba(89,164,192,0.05) 45%, transparent 85%)",
        ].join(", "),
      }}
      aria-hidden
    />
  );
}

// Chronological line through every breakthrough — the "spine" of the
// user's growth across galaxies. Heuristic stand-in for cross-galaxy
// significance; will be replaced by LLM-emitted influence scoring in
// V.5a. Drawn with a subtle white stroke that doesn't compete with
// per-constellation chains.
function CrossGalaxyChain({
  breakthroughs,
}: {
  breakthroughs: Positioned<BreakthroughDot>[];
}) {
  const ordered = [...breakthroughs].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const points = ordered
    .map((b) => `${b.x * 100},${b.y * 100}`)
    .join(" ");
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={BREAKTHROUGH_COLOR}
        strokeWidth={0.18}
        strokeOpacity={0.35}
        strokeDasharray="0.8 1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MindsetShiftStar({
  dot,
  buildHref,
}: {
  dot: Positioned<MindsetShiftDot>;
  buildHref: (id: string) => string;
}) {
  // Single-click highlights on the map (Link href); double-click
  // scrolls to the matching card in the Mindset Shifts list below.
  // Mirrors BreakthroughSun. The list lives on /progress so no
  // navigation needed — just scroll.
  return (
    <Link
      href={buildHref(dot.id)}
      scroll={false}
      aria-label={`Mindset shift: ${dot.content} (double-click to view in list)`}
      title={`Mindset shift — ${dot.content} (double-click to view in list)`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = document.getElementById(`ms-${dot.id}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }}
    >
      <svg
        viewBox="-8 -8 16 16"
        className="block h-4 w-4 transition hover:scale-125"
        style={{ overflow: "visible" }}
        aria-hidden
      >
        <circle r={7.5} fill="url(#halo-shift)" />
        <circle r={2.8} fill={MINDSET_COLOR} />
      </svg>
    </Link>
  );
}

// Goals are comets — they wander the universe independent of any
// galaxy, with a soft tail trailing behind. Position + tail direction
// come from the layout module (deterministic per goal id). The tail
// is an SVG line from the head outward in tailAngle direction; head
// is the same green ring used previously.
function GoalComet({
  dot,
  buildGoalHref,
}: {
  dot: PositionedGoal;
  buildGoalHref: (id: string) => string;
}) {
  const router = useRouter();
  const href = buildGoalHref(dot.id);
  const headX = dot.x * 100;
  const headY = dot.y * 100;
  const tailEndX = (dot.x + Math.cos(dot.tailAngle) * dot.tailLength) * 100;
  const tailEndY = (dot.y + Math.sin(dot.tailAngle) * dot.tailLength) * 100;
  const innerTailGradId = `comet-tail-inner-${dot.id}`;
  const outerTailGradId = `comet-tail-outer-${dot.id}`;
  // Two-layer tail: a wider, dimmer outer "coma + dust spread" sits
  // behind a narrower, brighter inner stream. Together they give the
  // tail a bright concentrated core that fades into a softer halo —
  // visually closer to real comet astrophotography than a single
  // flat triangle.
  const innerHalfWidthPct = 0.42;
  const outerHalfWidthPct = 0.95;
  const innerPerpX = -Math.sin(dot.tailAngle) * innerHalfWidthPct;
  const innerPerpY = Math.cos(dot.tailAngle) * innerHalfWidthPct;
  const outerPerpX = -Math.sin(dot.tailAngle) * outerHalfWidthPct;
  const outerPerpY = Math.cos(dot.tailAngle) * outerHalfWidthPct;
  const innerTailPoints = [
    `${headX + innerPerpX},${headY + innerPerpY}`,
    `${headX - innerPerpX},${headY - innerPerpY}`,
    `${tailEndX},${tailEndY}`,
  ].join(" ");
  const outerTailPoints = [
    `${headX + outerPerpX},${headY + outerPerpY}`,
    `${headX - outerPerpX},${headY - outerPerpY}`,
    `${tailEndX},${tailEndY}`,
  ].join(" ");

  return (
    <>
      {/* Two-layer tail: wider diffuse outer (the comet's coma + dust
          spread) sits behind the brighter inner stream. Both fade
          from head→tip but with different curves so the result reads
          as "bright concentrated core within a softer halo," matching
          how real comet tails appear in long-exposure photography. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ opacity: dot.opacity }}
        aria-hidden
      >
        <defs>
          <linearGradient
            id={outerTailGradId}
            gradientUnits="userSpaceOnUse"
            x1={headX}
            y1={headY}
            x2={tailEndX}
            y2={tailEndY}
          >
            <stop offset="0%" stopColor={GOAL_COLOR} stopOpacity={0.35} />
            <stop offset="40%" stopColor={GOAL_COLOR} stopOpacity={0.12} />
            <stop offset="100%" stopColor={GOAL_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient
            id={innerTailGradId}
            gradientUnits="userSpaceOnUse"
            x1={headX}
            y1={headY}
            x2={tailEndX}
            y2={tailEndY}
          >
            <stop offset="0%" stopColor={GOAL_COLOR} stopOpacity={0.95} />
            <stop offset="25%" stopColor={GOAL_COLOR} stopOpacity={0.55} />
            <stop offset="70%" stopColor={GOAL_COLOR} stopOpacity={0.18} />
            <stop offset="100%" stopColor={GOAL_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={outerTailPoints} fill={`url(#${outerTailGradId})`} />
        <polygon points={innerTailPoints} fill={`url(#${innerTailGradId})`} />
      </svg>
      {/* Head: layered halo + green disc + bright white-hot core.
          The inner core sells the comet as a *burning* nucleus rather
          than a flat sticker — same trick as the diffraction spike on
          the breakthrough sun, scaled down. Double-click jumps to the
          Goals tab with this goal highlighted. */}
      <Link
        href={href}
        aria-label={`Goal: ${dot.title} (double-click to view in Goals tab)`}
        title={`Goal — ${dot.title} (double-click to view in Goals tab)`}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
        style={{
          left: `${headX}%`,
          top: `${headY}%`,
          opacity: dot.opacity,
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/goals?goal=${dot.id}#g-${dot.id}`);
        }}
      >
        <svg
          viewBox="-8 -8 16 16"
          className="block h-4 w-4 transition hover:scale-125"
          style={{ overflow: "visible" }}
          aria-hidden
        >
          <circle r={7} fill="url(#halo-goal)" />
          <circle r={2.4} fill={GOAL_COLOR} />
          <circle r={0.9} fill="#ffffff" fillOpacity={0.95} />
        </svg>
      </Link>
    </>
  );
}

function Legend({
  color,
  label,
  size,
}: {
  color: string;
  label: string;
  size: number;
}) {
  // Mirror the on-map look: solid colored disc with a soft halo,
  // matching the SessionStar / MindsetShiftStar / BreakthroughSun /
  // GoalComet visual language.
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: `0 0 4px ${color}aa, 0 0 10px ${color}55`,
        }}
        aria-hidden
      />
      {label}
    </span>
  );
}

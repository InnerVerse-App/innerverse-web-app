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

// Decorative far-background "stars" — fixed positions, no data
// meaning, just adds depth to the dark sky behind the data points.
const FAR_STARS: Array<{ x: number; y: number; size: number }> = [
  { x: 12, y: 15, size: 1 },
  { x: 35, y: 22, size: 1.5 },
  { x: 58, y: 8, size: 1 },
  { x: 78, y: 30, size: 1 },
  { x: 92, y: 45, size: 1 },
  { x: 8, y: 60, size: 1 },
  { x: 28, y: 75, size: 1.5 },
  { x: 50, y: 82, size: 1 },
  { x: 70, y: 90, size: 1 },
  { x: 22, y: 38, size: 1 },
  { x: 65, y: 55, size: 1 },
  { x: 88, y: 18, size: 1 },
];

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

        // Goals that include this breakthrough — fan from the
        // breakthrough.
        if (goalLinks) {
          for (const [gid, gl] of goalLinks) {
            if (!gl.breakthroughIds.includes(selectedAnchor.id)) continue;
            const g = goalById.get(gid);
            if (!g) continue;
            const gx = g.x * 100;
            const gy = g.y * 100;
            pushEdge(anchorPoint.x, anchorPoint.y, gx, gy);
            pushPoint(
              gx,
              gy,
              Date.parse(g.lastEngagedAt ?? b.createdAt),
            );
            boostedIds.add(gid);
          }
        }
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
  // Measure chainPoints' bounding box (in 0–100 viewBox space), convert
  // to pixel space using the panel's actual size, then call
  // setTransform on react-zoom-pan-pinch to pan + zoom. Stable string
  // key prevents the effect from firing every render with the same data.
  const chainKey = chainPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("|");
  useEffect(() => {
    const ctrl = transformRef.current;
    const panel = panelRef.current;
    if (!ctrl) return;
    if (!selectedAnchor || chainPoints.length < 2 || !panel) {
      ctrl.resetTransform(450);
      return;
    }
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
          background:
            "radial-gradient(circle at center, rgba(89,164,192,0.12) 0%, transparent 35%), radial-gradient(ellipse at 75% 25%, rgba(89,164,192,0.06) 0%, transparent 50%), radial-gradient(ellipse at 25% 75%, rgba(89,164,192,0.05) 0%, transparent 50%), radial-gradient(circle at center, #02101c 0%, #00050a 80%)",
          touchAction: "none",
        }}
      >
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
                          stopOpacity={0.7}
                        />
                        <stop
                          offset="55%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor={BREAKTHROUGH_COLOR}
                          stopOpacity={0}
                        />
                      </radialGradient>
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
                  {FAR_STARS.map((s, i) => (
                    <span
                      key={`bg-${i}`}
                      className="absolute rounded-full bg-white/30"
                      style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                      }}
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
                          rather than a flat fan. */}
                      {chainEdges.map((e, i) => (
                        <line
                          key={i}
                          x1={e.fromX}
                          y1={e.fromY}
                          x2={e.toX}
                          y2={e.toY}
                          stroke="white"
                          strokeWidth={0.3}
                          strokeOpacity={0.5}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          style={{
                            filter:
                              "drop-shadow(0 0 1px rgba(255,255,255,0.5))",
                          }}
                        />
                      ))}
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

                  {/* Render order is largest-first / smallest-last so
                      that when hit areas overlap (a session positioned
                      close to its breakthrough's sun, for example) the
                      smaller dot — the one the user is more likely
                      trying to click — wins the pointer event. */}
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

                  {/* Sessions + shifts share a fade-in wrapper so they
                      only become visible once the user has zoomed in
                      past the universe view. At full zoom-out the user
                      sees galaxy glows and suns, not individual stars. */}
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
  return (
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
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
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
        viewBox="-12 -12 24 24"
        className="block h-7 w-7 transition hover:scale-125"
        style={{ overflow: "visible" }}
        aria-hidden
      >
        <circle r={11} fill="url(#halo-sun)" />
        <circle r={4.5} fill={BREAKTHROUGH_COLOR} />
      </svg>
    </Link>
  );
}

// Galaxy atmospheric glow — very faint, barely-visible white haze
// around the sun. The galaxy's IDENTITY comes from the cluster of
// stars, not the glow; the glow just gives the impression of an
// unresolved disc behind them. No more orange-nebula bleed.
function GalaxyGlow({ galaxy }: { galaxy: GalaxyMeta }) {
  const haloPct = galaxy.radius * 100 * 1.6;
  return (
    <span
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: `${galaxy.centerX * 100}%`,
        top: `${galaxy.centerY * 100}%`,
        width: `${haloPct}%`,
        height: `${haloPct}%`,
        background:
          "radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.025) 35%, transparent 75%)",
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
  const tailGradId = `comet-tail-${dot.id}`;
  // Tail tapers from the head circle's width (≈ head r in tail-SVG
  // viewBox units, which is panel-fraction-percent) to a single
  // point at the tail-end. Computed as a triangle polygon: two
  // perpendicular-offset vertices at the head, one vertex at the
  // tail-end.
  const headHalfWidthPct = 0.42; // tuned to match the head circle's visible radius
  const perpX = -Math.sin(dot.tailAngle) * headHalfWidthPct;
  const perpY = Math.cos(dot.tailAngle) * headHalfWidthPct;
  const tailPolyPoints = [
    `${headX + perpX},${headY + perpY}`,
    `${headX - perpX},${headY - perpY}`,
    `${tailEndX},${tailEndY}`,
  ].join(" ");

  return (
    <>
      {/* Tail: triangular polygon tapering from the head's circle
          width down to a single point at the tail-end, filled with
          a gradient that fades from head color to transparent. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ opacity: dot.opacity }}
        aria-hidden
      >
        <defs>
          <linearGradient
            id={tailGradId}
            gradientUnits="userSpaceOnUse"
            x1={headX}
            y1={headY}
            x2={tailEndX}
            y2={tailEndY}
          >
            <stop offset="0%" stopColor={GOAL_COLOR} stopOpacity={0.8} />
            <stop offset="100%" stopColor={GOAL_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon
          points={tailPolyPoints}
          fill={`url(#${tailGradId})`}
        />
      </svg>
      {/* Head: same shape language as session/shift — halo + solid
          colored disc — just green. Double-click jumps to the Goals
          tab with this goal highlighted, matching the SessionStar
          pattern. */}
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

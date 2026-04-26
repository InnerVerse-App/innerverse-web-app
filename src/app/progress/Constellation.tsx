import Link from "next/link";

import { formatDateCompact } from "@/lib/format";

import {
  type ConstellationLayout,
  type Positioned,
  type SessionDot,
  type BreakthroughDot,
  type MindsetShiftDot,
  type GoalDot,
} from "./constellation-layout";

type Props = {
  layout: ConstellationLayout;
  hasGoals: boolean;
  // Optional URL prefix for the goals link target. Demo mode passes
  // "/goals?demo=1" so navigation stays in demo. Real mode uses
  // "/goals" (default).
  goalsHref?: string;
  // Map of breakthrough_id → constellation name + contributing star
  // ids. When a breakthrough is selected, lines are drawn from it to
  // those stars and the pill row labels it with `name`.
  constellationLinks?: Map<
    string,
    {
      name: string;
      sessionIds: string[];
      shiftIds: string[];
      goalIds: string[];
    }
  >;
  // The currently-selected breakthrough id (from the URL query param).
  // null when no constellation is selected.
  selectedBreakthroughId?: string | null;
  // URL prefix for selecting a breakthrough — appended with
  // `&constellation=<id>` (or `?constellation=<id>`). Demo passes
  // "/progress?demo=1"; real passes "/progress".
  selectHrefBase?: string;
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

// Each Link wrapper carries this padding so the touch target reaches
// ~44px even though the visible star is small. Matches Apple HIG
// minimum tap target (44pt).
const TAP_PADDING = "p-3";

export function Constellation({
  layout,
  hasGoals,
  goalsHref = "/goals",
  constellationLinks,
  selectedBreakthroughId = null,
  selectHrefBase = "/progress",
}: Props) {
  const isEmpty =
    layout.sessions.length === 0 &&
    layout.breakthroughs.length === 0 &&
    layout.mindsetShifts.length === 0 &&
    layout.goals.length === 0;

  // Build a chronological "path of progression" through the
  // constellation — each contributing star ordered by when it
  // happened, with the breakthrough as the final point. The user
  // reads the line as their journey leading up to the breakthrough,
  // not as a hub-and-spoke radiating from it.
  const selectedLinks =
    selectedBreakthroughId && constellationLinks
      ? constellationLinks.get(selectedBreakthroughId)
      : null;
  const selectedBreakthrough = selectedBreakthroughId
    ? layout.breakthroughs.find((b) => b.id === selectedBreakthroughId)
    : null;
  const chainPoints: Array<{ x: number; y: number; t: number }> = [];
  if (selectedBreakthrough && selectedLinks) {
    const sessionById = new Map(layout.sessions.map((s) => [s.id, s]));
    const shiftById = new Map(layout.mindsetShifts.map((m) => [m.id, m]));
    const goalById = new Map(layout.goals.map((g) => [g.id, g]));
    for (const id of selectedLinks.sessionIds) {
      const s = sessionById.get(id);
      if (s) {
        chainPoints.push({
          x: s.x * 100,
          y: s.y * 100,
          t: Date.parse(s.endedAt),
        });
      }
    }
    for (const id of selectedLinks.shiftIds) {
      const m = shiftById.get(id);
      if (m) {
        chainPoints.push({
          x: m.x * 100,
          y: m.y * 100,
          t: Date.parse(m.createdAt),
        });
      }
    }
    for (const id of selectedLinks.goalIds) {
      const g = goalById.get(id);
      // Goals without lastEngagedAt have no time-position in the
      // journey — skip them from the chain. They still appear as
      // green rings on the panel.
      if (g && g.lastEngagedAt) {
        chainPoints.push({
          x: g.x * 100,
          y: g.y * 100,
          t: Date.parse(g.lastEngagedAt),
        });
      }
    }
    // Sort oldest → newest, then append the breakthrough as the
    // terminal point. The chain visually leads the eye from the
    // earliest contributor to the breakthrough.
    chainPoints.sort((a, b) => a.t - b.t);
    chainPoints.push({
      x: selectedBreakthrough.x * 100,
      y: selectedBreakthrough.y * 100,
      t: Date.parse(selectedBreakthrough.createdAt),
    });
  }

  // Pill-row helper: build the URL for "select breakthrough X". The
  // base is "/progress" or "/progress?demo=1"; we append the right
  // separator.
  const buildSelectUrl = (breakthroughId: string | null) => {
    const sep = selectHrefBase.includes("?") ? "&" : "?";
    if (breakthroughId === null) return selectHrefBase;
    return `${selectHrefBase}${sep}constellation=${breakthroughId}`;
  };

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-white">Your Constellation</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Your growth radiating outward. The center is now; older stars
        sit farther out. Bright stars are recent; faded stars are
        waiting for you to return.
      </p>

      {constellationLinks && layout.breakthroughs.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">
            Constellations
          </p>
          {/* Horizontal scrollable pill row. Each pill links to a
              breakthrough's constellation; the lines draw on the
              server-rendered next page. */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-2">
              <Link
                href={buildSelectUrl(null)}
                className={
                  "shrink-0 rounded-full border px-3 py-1 text-xs transition " +
                  (selectedBreakthroughId === null
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-white/10 text-neutral-400 hover:border-white/30 hover:text-neutral-200")
                }
              >
                All
              </Link>
              {layout.breakthroughs.map((b) => {
                const isActive = selectedBreakthroughId === b.id;
                const links = constellationLinks?.get(b.id);
                // Pill label = constellation name when one exists,
                // otherwise the breakthrough's content as a fallback.
                const pillLabel = links?.name ?? b.content;
                return (
                  <Link
                    key={b.id}
                    href={buildSelectUrl(b.id)}
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
        </div>
      ) : null}

      <div
        className="relative mt-4 aspect-square w-full overflow-hidden rounded-xl border border-white/10"
        style={{
          background:
            "radial-gradient(circle at center, rgba(89,164,192,0.12) 0%, transparent 35%), radial-gradient(ellipse at 75% 25%, rgba(89,164,192,0.06) 0%, transparent 50%), radial-gradient(ellipse at 25% 75%, rgba(89,164,192,0.05) 0%, transparent 50%), radial-gradient(circle at center, #02101c 0%, #00050a 80%)",
        }}
      >
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

        {/* White constellation polyline — chronological chain through
            the contributing stars to the breakthrough. Drawn behind
            stars. Visible only when a constellation is selected. */}
        {chainPoints.length >= 2 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={chainPoints
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke="white"
              strokeWidth={0.3}
              strokeOpacity={0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: "drop-shadow(0 0 1px rgba(255,255,255,0.5))" }}
            />
          </svg>
        ) : null}

        {/* Center "now" reference — subtle 1px tick rather than a
            bright nucleus. The radial gradient on the panel already
            implies the center; a loud dot was overkill. */}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
          aria-hidden
        />

        {/* Render order = z-stack from bottom to top. Most-prominent
            and most-tap-likely items render last so their hit zone
            wins on overlap. Goals are rings (semi-transparent) so
            they sit lower than the filled session/breakthrough dots. */}
        {layout.mindsetShifts.map((m) => (
          <MindsetShiftStar key={m.id} dot={m} />
        ))}
        {layout.goals.map((g) => (
          <GoalStar key={g.id} dot={g} goalsHref={goalsHref} />
        ))}
        {layout.sessions.map((s) => (
          <SessionStar key={s.id} dot={s} />
        ))}
        {layout.breakthroughs.map((b) => (
          <BreakthroughStar key={b.id} dot={b} />
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

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <Legend
          color={SESSION_COLOR}
          label="Session"
          shape="dot"
          size={6}
        />
        <Legend
          color={GOAL_COLOR}
          label="Goal"
          shape="ring"
          size={10}
        />
        <Legend
          color={MINDSET_COLOR}
          label="Mindset shift"
          shape="dot"
          size={14}
        />
        <Legend
          color={BREAKTHROUGH_COLOR}
          label="Breakthrough"
          shape="star"
          size={16}
        />
      </div>
    </section>
  );
}

function SessionStar({ dot }: { dot: Positioned<SessionDot> }) {
  const dateLabel = formatDateCompact(dot.endedAt);
  return (
    <Link
      href={`/sessions/${dot.id}`}
      aria-label={`Open session from ${dateLabel}`}
      title={`Session — ${dateLabel}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-1.5 w-1.5 rounded-full transition hover:scale-150"
        style={{
          background: SESSION_COLOR,
          boxShadow: `0 0 3px ${SESSION_COLOR}, 0 0 8px ${SESSION_COLOR}80, inset 0 0 0 0.5px rgba(0,5,10,0.6)`,
        }}
      />
    </Link>
  );
}

// 8-pointed compass-rose star polygon centered in viewBox 0..24.
// Outer radius 10, inner radius 4. Long cardinal + diagonal rays.
// Distinct shape from circles so breakthroughs read as the rare,
// hard-won, "shining" moments.
const STAR_POINTS =
  "12,2 13.53,8.30 19.07,4.93 15.70,10.47 22,12 15.70,13.53 19.07,19.07 13.53,15.70 12,22 10.47,15.70 4.93,19.07 8.30,13.53 2,12 8.30,10.47 4.93,4.93 10.47,8.30";

function BreakthroughStar({ dot }: { dot: Positioned<BreakthroughDot> }) {
  return (
    <a
      href={`#bt-${dot.id}`}
      aria-label={`Breakthrough: ${dot.content}`}
      title={`Breakthrough — ${dot.content}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="block h-5 w-5 transition hover:scale-125"
        style={{
          filter: `drop-shadow(0 0 4px ${BREAKTHROUGH_COLOR}) drop-shadow(0 0 10px ${BREAKTHROUGH_COLOR}cc) drop-shadow(0 0 18px ${BREAKTHROUGH_COLOR}66)`,
          overflow: "visible",
        }}
        aria-hidden
      >
        <polygon points={STAR_POINTS} fill={BREAKTHROUGH_COLOR} />
      </svg>
    </a>
  );
}

// Mindset shifts render as the LARGEST circles. They represent
// persistent evolving entities — the most "work" of any non-
// breakthrough star.
function MindsetShiftStar({ dot }: { dot: Positioned<MindsetShiftDot> }) {
  return (
    <a
      href={`#ms-${dot.id}`}
      aria-label={`Mindset shift: ${dot.content}`}
      title={`Mindset shift — ${dot.content}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-3.5 w-3.5 rounded-full transition hover:scale-125"
        style={{
          background: MINDSET_COLOR,
          boxShadow: `0 0 6px ${MINDSET_COLOR}, 0 0 14px ${MINDSET_COLOR}80, inset 0 0 0 0.5px rgba(0,5,10,0.6)`,
        }}
      />
    </a>
  );
}

// Goal stars are MEDIUM circles rendered as rings. The ring cue
// says "this is a container — a practice you keep returning to"
// rather than a moment-in-time event.
function GoalStar({
  dot,
  goalsHref,
}: {
  dot: Positioned<GoalDot>;
  goalsHref: string;
}) {
  return (
    <Link
      href={`${goalsHref}#g-${dot.id}`}
      aria-label={`Goal: ${dot.title}`}
      title={`Goal — ${dot.title}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${TAP_PADDING}`}
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-2.5 w-2.5 rounded-full transition hover:scale-125"
        style={{
          background: `${GOAL_COLOR}26`,
          border: `1.5px solid ${GOAL_COLOR}`,
          boxShadow: `0 0 4px ${GOAL_COLOR}80, 0 0 10px ${GOAL_COLOR}40`,
        }}
      />
    </Link>
  );
}

function Legend({
  color,
  label,
  shape,
  size,
}: {
  color: string;
  label: string;
  // Visual shape — matches the in-panel rendering for that category.
  shape: "dot" | "ring" | "star";
  // Pixel size of the swatch.
  size: number;
}) {
  const swatch =
    shape === "star" ? (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{
          filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color}88)`,
          overflow: "visible",
        }}
        aria-hidden
      >
        <polygon points={STAR_POINTS} fill={color} />
      </svg>
    ) : shape === "ring" ? (
      <span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          background: `${color}26`,
          border: `1.5px solid ${color}`,
        }}
        aria-hidden
      />
    ) : (
      <span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: `0 0 3px ${color}, 0 0 6px ${color}80`,
        }}
        aria-hidden
      />
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}

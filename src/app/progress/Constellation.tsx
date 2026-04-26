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

export function Constellation({ layout, hasGoals, goalsHref = "/goals" }: Props) {
  const isEmpty =
    layout.sessions.length === 0 &&
    layout.breakthroughs.length === 0 &&
    layout.mindsetShifts.length === 0 &&
    layout.goals.length === 0;

  // Identify the most-recent session so we can label it "Today" /
  // its date for orientation. Sessions are pre-sorted oldest→newest
  // by computeLayout.
  const latestSessionId =
    layout.sessions.length > 0
      ? layout.sessions[layout.sessions.length - 1].id
      : null;

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-white">Your Constellation</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Each star is a moment of growth. Bright stars are recent; faded
        stars are waiting for you to return.
      </p>

      <div
        className="relative mt-4 h-[360px] overflow-hidden rounded-xl border border-white/10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 30%, rgba(89,164,192,0.10) 0%, transparent 45%), radial-gradient(ellipse at 80% 60%, rgba(89,164,192,0.06) 0%, transparent 45%), linear-gradient(180deg, #02101c 0%, #00050a 100%)",
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

        {layout.pathPoints.length >= 2 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={layout.pathPoints
                .map((p) => `${p.x * 100},${p.y * 100}`)
                .join(" ")}
              fill="none"
              stroke={SESSION_COLOR}
              strokeWidth={0.25}
              strokeOpacity={0.4}
              strokeDasharray="0.8 1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}

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
          <SessionStar
            key={s.id}
            dot={s}
            isLatest={s.id === latestSessionId}
          />
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
        <Legend color={SESSION_COLOR} label="Session" />
        <Legend color={BREAKTHROUGH_COLOR} label="Breakthrough" filled />
        <Legend color={MINDSET_COLOR} label="Mindset shift" />
        <Legend color={GOAL_COLOR} label="Goal" outlined />
      </div>
    </section>
  );
}

function SessionStar({
  dot,
  isLatest,
}: {
  dot: Positioned<SessionDot>;
  isLatest: boolean;
}) {
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
        className="block h-2.5 w-2.5 rounded-full transition hover:scale-125"
        style={{
          background: SESSION_COLOR,
          boxShadow: `0 0 4px ${SESSION_COLOR}, 0 0 10px ${SESSION_COLOR}80, inset 0 0 0 0.5px rgba(0,5,10,0.6)`,
        }}
      />
      {isLatest ? (
        <span
          className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white/80"
          aria-hidden
        >
          Today
        </span>
      ) : null}
    </Link>
  );
}

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
      <span
        className="block h-4 w-4 rounded-full transition hover:scale-125"
        style={{
          background: BREAKTHROUGH_COLOR,
          boxShadow: `0 0 10px ${BREAKTHROUGH_COLOR}, 0 0 22px ${BREAKTHROUGH_COLOR}cc, 0 0 36px ${BREAKTHROUGH_COLOR}66, inset 0 0 0 0.5px rgba(0,5,10,0.7)`,
        }}
      />
    </a>
  );
}

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
        className="block h-2 w-2 rounded-full transition hover:scale-150"
        style={{
          background: MINDSET_COLOR,
          boxShadow: `0 0 3px ${MINDSET_COLOR}, 0 0 8px ${MINDSET_COLOR}80, inset 0 0 0 0.5px rgba(0,5,10,0.6)`,
        }}
      />
    </a>
  );
}

// Goal stars are rings, not filled dots. The visual cue says "this
// is a container — a practice you keep returning to" rather than a
// moment-in-time event.
function GoalStar({
  dot,
  goalsHref,
}: {
  dot: Positioned<GoalDot>;
  goalsHref: string;
}) {
  // Append the per-goal anchor onto the goalsHref base. Both demo
  // and real /goals add `id="g-${id}"` to each goal card, so the
  // browser scrolls there on click.
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
        className="block h-3.5 w-3.5 rounded-full transition hover:scale-125"
        style={{
          background: `${GOAL_COLOR}26`,
          border: `1.5px solid ${GOAL_COLOR}`,
          boxShadow: `0 0 5px ${GOAL_COLOR}80, 0 0 12px ${GOAL_COLOR}40`,
        }}
      />
    </Link>
  );
}

function Legend({
  color,
  label,
  outlined = false,
  filled = false,
}: {
  color: string;
  label: string;
  outlined?: boolean;
  filled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={
          outlined
            ? {
                background: `${color}26`,
                border: `1.5px solid ${color}`,
              }
            : filled
              ? {
                  background: color,
                  boxShadow: `0 0 4px ${color}, 0 0 8px ${color}80`,
                }
              : { background: color, boxShadow: `0 0 4px ${color}` }
        }
        aria-hidden
      />
      {label}
    </span>
  );
}

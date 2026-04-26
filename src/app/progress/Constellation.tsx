import Link from "next/link";

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

export function Constellation({ layout, hasGoals }: Props) {
  const isEmpty =
    layout.sessions.length === 0 &&
    layout.breakthroughs.length === 0 &&
    layout.mindsetShifts.length === 0 &&
    layout.goals.length === 0;

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

        {layout.sessions.map((s) => (
          <SessionStar key={s.id} dot={s} />
        ))}
        {layout.mindsetShifts.map((m) => (
          <MindsetShiftStar key={m.id} dot={m} />
        ))}
        {layout.breakthroughs.map((b) => (
          <BreakthroughStar key={b.id} dot={b} />
        ))}
        {layout.goals.map((g) => (
          <GoalStar key={g.id} dot={g} />
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
        <Legend color={BREAKTHROUGH_COLOR} label="Breakthrough" />
        <Legend color={MINDSET_COLOR} label="Mindset shift" />
        <Legend color={GOAL_COLOR} label="Goal" />
      </div>
    </section>
  );
}

function SessionStar({ dot }: { dot: Positioned<SessionDot> }) {
  return (
    <Link
      href={`/sessions/${dot.id}`}
      aria-label="Open session"
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-3 w-3 rounded-full transition hover:scale-125"
        style={{
          background: SESSION_COLOR,
          boxShadow: `0 0 6px ${SESSION_COLOR}, 0 0 14px ${SESSION_COLOR}80`,
        }}
      />
    </Link>
  );
}

function BreakthroughStar({ dot }: { dot: Positioned<BreakthroughDot> }) {
  return (
    <Link
      href={`/sessions/${dot.sessionId}`}
      aria-label={`Breakthrough: ${dot.content}`}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-3.5 w-3.5 rounded-full transition hover:scale-125"
        style={{
          background: BREAKTHROUGH_COLOR,
          boxShadow: `0 0 8px ${BREAKTHROUGH_COLOR}, 0 0 18px ${BREAKTHROUGH_COLOR}cc, 0 0 32px ${BREAKTHROUGH_COLOR}60`,
        }}
      />
    </Link>
  );
}

function MindsetShiftStar({ dot }: { dot: Positioned<MindsetShiftDot> }) {
  return (
    <Link
      href={`/sessions/${dot.sessionId}`}
      aria-label={`Mindset shift: ${dot.content}`}
      className="absolute -translate-x-1/2 -translate-y-1/2"
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
          boxShadow: `0 0 4px ${MINDSET_COLOR}, 0 0 10px ${MINDSET_COLOR}80`,
        }}
      />
    </Link>
  );
}

function GoalStar({ dot }: { dot: Positioned<GoalDot> }) {
  return (
    <Link
      href="/goals"
      aria-label={`Goal: ${dot.title}`}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${dot.x * 100}%`,
        top: `${dot.y * 100}%`,
        opacity: dot.opacity,
      }}
    >
      <span
        className="block h-2.5 w-2.5 rounded-full transition hover:scale-150"
        style={{
          background: GOAL_COLOR,
          boxShadow: `0 0 5px ${GOAL_COLOR}, 0 0 12px ${GOAL_COLOR}80`,
        }}
      />
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
        aria-hidden
      />
      {label}
    </span>
  );
}

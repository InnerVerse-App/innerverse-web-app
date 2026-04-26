// Pure layout functions for the Progress-tab constellation. No DOM,
// no React, no Supabase — just deterministic math so the visual layout
// is stable across renders and easy to unit-test.

export type SessionDot = {
  id: string;
  endedAt: string;
};

export type BreakthroughDot = {
  id: string;
  sessionId: string;
  content: string;
  createdAt: string;
};

export type MindsetShiftDot = {
  id: string;
  sessionId: string;
  content: string;
  createdAt: string;
};

export type GoalDot = {
  id: string;
  title: string;
  lastEngagedAt: string | null;
};

export type Positioned<T> = T & {
  x: number; // 0–1 fraction of panel width
  y: number; // 0–1 fraction of panel height
  opacity: number; // 0.3–1.0 recency fade
};

export type ConstellationLayout = {
  sessions: Positioned<SessionDot>[];
  breakthroughs: Positioned<BreakthroughDot>[];
  mindsetShifts: Positioned<MindsetShiftDot>[];
  goals: Positioned<GoalDot>[];
  // Polyline points for the chronological session path, in panel
  // fractions. Empty when fewer than two sessions.
  pathPoints: { x: number; y: number }[];
};

// FNV-1a-ish 32-bit hash → 0..1 float. Stable across runs; used to
// pin a star to the same vertical position whenever it's rendered.
export function hashFloat(input: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

// Recency curve: 0 days → 1.0; ≥30 days → 0.15 floor; linear between.
// Floor exists so neglected items stay visible (the "fading gauge").
// Floor is intentionally low — the whole point is that stale items
// look ghostly so the user notices.
export function recencyOpacity(
  whenIso: string | null,
  nowMs: number = Date.now(),
): number {
  if (!whenIso) return 0.15;
  const ageDays = Math.max(0, (nowMs - Date.parse(whenIso)) / 86_400_000);
  return Math.max(0.15, 1 - (ageDays / 30) * 0.85);
}

// X-position helper for time-based items: maps a date to a position
// across the visible time window. Items older than the window clamp
// to the left edge.
function xForDate(
  whenIso: string | null,
  windowStartMs: number,
  windowEndMs: number,
  leftPad = 0.06,
  rightPad = 0.94,
): number {
  if (!whenIso) return leftPad;
  const t = Date.parse(whenIso);
  if (t <= windowStartMs) return leftPad;
  if (t >= windowEndMs) return rightPad;
  const frac = (t - windowStartMs) / (windowEndMs - windowStartMs);
  return leftPad + frac * (rightPad - leftPad);
}

export function computeLayout(input: {
  sessions: SessionDot[]; // any order; we'll sort oldest→newest
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
  nowMs?: number;
}): ConstellationLayout {
  const nowMs = input.nowMs ?? Date.now();
  const sortedSessions = [...input.sessions].sort(
    (a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt),
  );

  // Time window for x-positioning. Sessions use chronological index
  // for spacing (visually predictable). Goals use date-based
  // positioning so a goal anchors to its last-engaged session or
  // earlier.
  const windowStartMs =
    sortedSessions.length > 0 ? Date.parse(sortedSessions[0].endedAt) : nowMs;
  const windowEndMs = nowMs;

  // Sessions: index-spaced across the panel. Y is hash-stable in the
  // middle 30%–70% band so sessions don't bunch at the edges and
  // satellites have room.
  const positionedSessions: Positioned<SessionDot>[] = sortedSessions.map(
    (s, i) => {
      const xFrac =
        sortedSessions.length === 1
          ? 0.5
          : 0.06 + (i / (sortedSessions.length - 1)) * (0.94 - 0.06);
      const yFrac = 0.3 + hashFloat(s.id, 1) * 0.4;
      return {
        ...s,
        x: xFrac,
        y: yFrac,
        opacity: recencyOpacity(s.endedAt, nowMs),
      };
    },
  );

  const sessionById = new Map(positionedSessions.map((s) => [s.id, s]));

  // Breakthroughs: small offset from their parent session, deterministic
  // angle from the breakthrough id.
  const positionedBreakthroughs: Positioned<BreakthroughDot>[] =
    input.breakthroughs.map((b) => {
      const parent = sessionById.get(b.sessionId);
      const angle = hashFloat(b.id, 7) * Math.PI * 2;
      const radiusX = 0.075;
      const radiusY = 0.10;
      const px = parent?.x ?? 0.5;
      const py = parent?.y ?? 0.5;
      return {
        ...b,
        x: clamp01(px + Math.cos(angle) * radiusX),
        y: clamp01(py + Math.sin(angle) * radiusY),
        opacity: recencyOpacity(b.createdAt, nowMs),
      };
    });

  const breakthroughsBySession = new Map<string, Positioned<BreakthroughDot>[]>();
  for (const b of positionedBreakthroughs) {
    const arr = breakthroughsBySession.get(b.sessionId) ?? [];
    arr.push(b);
    breakthroughsBySession.set(b.sessionId, arr);
  }

  // Mindset shifts: orbit their parent breakthrough if one exists in
  // the same session, else orbit the session at a slightly larger
  // radius than breakthroughs use.
  const positionedShifts: Positioned<MindsetShiftDot>[] = input.mindsetShifts.map(
    (m) => {
      const sessionPeers = breakthroughsBySession.get(m.sessionId) ?? [];
      const angle = hashFloat(m.id, 13) * Math.PI * 2;
      let anchorX: number;
      let anchorY: number;
      let radiusX: number;
      let radiusY: number;
      if (sessionPeers.length > 0) {
        const peer = sessionPeers[Math.floor(hashFloat(m.id, 17) * sessionPeers.length)];
        anchorX = peer.x;
        anchorY = peer.y;
        radiusX = 0.04;
        radiusY = 0.055;
      } else {
        const parent = sessionById.get(m.sessionId);
        anchorX = parent?.x ?? 0.5;
        anchorY = parent?.y ?? 0.5;
        radiusX = 0.085;
        radiusY = 0.115;
      }
      return {
        ...m,
        x: clamp01(anchorX + Math.cos(angle) * radiusX),
        y: clamp01(anchorY + Math.sin(angle) * radiusY),
        opacity: recencyOpacity(m.createdAt, nowMs),
      };
    },
  );

  // Goals: x = position of last engagement in the time window
  // (anchored to left when older than the window or never engaged).
  // Y = hash-stable across the full height so goals span vertically
  // and don't compete with the session band.
  const positionedGoals: Positioned<GoalDot>[] = input.goals.map((g) => {
    const x = xForDate(g.lastEngagedAt, windowStartMs, windowEndMs);
    // Goal y-range tightened from 0.1–0.9 to 0.15–0.85 so goals don't
    // press against the panel edges and feel like they're escaping
    // the constellation.
    const y = 0.15 + hashFloat(g.id, 31) * 0.7;
    return {
      ...g,
      x,
      y,
      opacity: recencyOpacity(g.lastEngagedAt, nowMs),
    };
  });

  // Connecting path: chronological session positions, in order.
  const pathPoints =
    positionedSessions.length >= 2
      ? positionedSessions.map((s) => ({ x: s.x, y: s.y }))
      : [];

  return {
    sessions: positionedSessions,
    breakthroughs: positionedBreakthroughs,
    mindsetShifts: positionedShifts,
    goals: positionedGoals,
    pathPoints,
  };
}

function clamp01(v: number): number {
  if (v < 0.04) return 0.04;
  if (v > 0.96) return 0.96;
  return v;
}

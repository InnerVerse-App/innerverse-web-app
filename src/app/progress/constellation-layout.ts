// Pure layout functions for the Progress-tab constellation. No DOM,
// no React, no Supabase — just deterministic math so the visual
// layout is stable across renders and easy to unit-test.
//
// V2 RADIAL MODEL:
//   - Center of the panel = "now / today"
//   - Distance from center = age (today → near center, ≥ageWindowDays
//     → at the outer edge)
//   - Angle (direction from center):
//       * Goals get a hash-stable angle per goal id — each goal is
//         a "direction of growth" radiating from the center. Stars
//         tied to that goal cluster along that direction.
//       * Sessions, breakthroughs, mindset shifts get a hash-stable
//         angle per item id ("freelancer" scatter). They are not
//         pulled toward any goal angle. A breakthrough is a
//         breakthrough whether or not a goal underlies it.
//   - Brightness fades with age (recencyOpacity). Goals brighten on
//     engagement (their lastEngagedAt drives both age and brightness).
//
// Cross-item brightness propagation (an old breakthrough lighting up
// when a recent session works on its goal) requires data we don't
// currently track per-session — deferred to a future schema chunk.

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
  opacity: number; // 0.15–1.0 recency fade
};

export type ConstellationLayout = {
  sessions: Positioned<SessionDot>[];
  breakthroughs: Positioned<BreakthroughDot>[];
  mindsetShifts: Positioned<MindsetShiftDot>[];
  goals: Positioned<GoalDot>[];
};

// FNV-1a-ish 32-bit hash → 0..1 float. Stable across runs; used to
// pick stable random angles for "freelancer" stars.
export function hashFloat(input: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

// Default time window (days) used by both distance-from-center and
// recency-opacity curves. Today = 0 days = at the inner ring (and
// full brightness); ageWindowDays+ = at the outer ring (and floor
// brightness). Configurable per-render so the user can toggle 30d /
// 90d / 1yr / All-time views.
export const DEFAULT_AGE_WINDOW_DAYS = 30;

// Recency curve: 0 days → 1.0; ≥ageWindowDays → 0.15 floor; linear
// between. Floor exists so neglected items stay visible (the
// "fading gauge").
export function recencyOpacity(
  whenIso: string | null,
  nowMs: number = Date.now(),
  ageWindowDays: number = DEFAULT_AGE_WINDOW_DAYS,
): number {
  if (!whenIso) return 0.15;
  const ageDays = Math.max(0, (nowMs - Date.parse(whenIso)) / 86_400_000);
  return Math.max(0.15, 1 - (ageDays / ageWindowDays) * 0.85);
}

// Inner / outer ring radii as fractions of the panel's half-width.
// Stars are positioned in the annulus between these. Inner ring is
// non-zero so today's stars don't all collapse onto the center
// nucleus.
const INNER_RING_FRAC = 0.10;
const OUTER_RING_FRAC = 0.46;

function distanceFromCenter(
  whenIso: string | null,
  nowMs: number,
  ageWindowDays: number,
): number {
  if (!whenIso) return OUTER_RING_FRAC;
  const ageDays = Math.max(0, (nowMs - Date.parse(whenIso)) / 86_400_000);
  const t = Math.min(1, ageDays / ageWindowDays);
  return INNER_RING_FRAC + t * (OUTER_RING_FRAC - INNER_RING_FRAC);
}

function polarToXY(
  angleRad: number,
  distance: number,
): { x: number; y: number } {
  // Center is (0.5, 0.5) of the panel. Distance is in panel-fraction
  // units (so 0.5 reaches the edge in any direction).
  return {
    x: 0.5 + Math.cos(angleRad) * distance,
    y: 0.5 + Math.sin(angleRad) * distance,
  };
}

// Tiny radial jitter so multiple items at the exact same age + angle
// don't stack perfectly. Hash-derived per item so it's stable.
function jitter(id: string, seed: number, scale: number): number {
  return (hashFloat(id, seed) - 0.5) * scale * 2;
}

// Per-constellation contributor wedge size (radians). When a session
// or mindset shift is a contributor to a breakthrough's constellation,
// its angle is clustered within ±half this width around the
// breakthrough's angle — so each constellation occupies a wedge of
// the sky instead of having its lines crisscross the diameter.
const CONSTELLATION_WEDGE_RAD = Math.PI / 9; // ≈ 20°

// Narrow shape of constellation links that the layout function
// cares about — just the contributor lists. Demo data and (V.5a)
// real data can both satisfy this.
type ConstellationContributorIds = {
  sessionIds: string[];
  shiftIds: string[];
};

// Hash-based stable angle for a breakthrough. Exposed so demo /
// callers can compute identical angles outside the layout if they
// need to pre-compute anchor maps.
export function angleForBreakthrough(id: string): number {
  return hashFloat(id, 7) * Math.PI * 2;
}

// Build a map of contributor_id → anchor angle, using the most-
// recent breakthrough an item contributes to as its anchor (newest-
// wins). Items not in any breakthrough's constellation get no anchor
// and fall back to hash-random angles.
function buildContributorAnchorMap(
  breakthroughs: BreakthroughDot[],
  links: Map<string, ConstellationContributorIds>,
): Map<string, number> {
  const sortedNewestFirst = [...breakthroughs].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const anchors = new Map<string, number>();
  for (const b of sortedNewestFirst) {
    const cl = links.get(b.id);
    if (!cl) continue;
    const angle = angleForBreakthrough(b.id);
    for (const sid of cl.sessionIds) {
      if (!anchors.has(sid)) anchors.set(sid, angle);
    }
    for (const mid of cl.shiftIds) {
      if (!anchors.has(mid)) anchors.set(mid, angle);
    }
  }
  return anchors;
}

export function computeLayout(input: {
  sessions: SessionDot[];
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
  nowMs?: number;
  // Time window for distance + opacity. Today → inner ring +
  // brightest. ageWindowDays old → outer ring + floor opacity.
  // User-toggleable via the constellation panel's window pills.
  ageWindowDays?: number;
  // When provided, sessions and shifts that are contributors to a
  // breakthrough's constellation cluster their angle around that
  // breakthrough's angle (within a small jitter wedge). Otherwise
  // they use hash-random angles like other freelancers. This makes
  // each constellation occupy a wedge of the sky, so its lines stay
  // localized rather than crisscrossing the diameter.
  constellationLinks?: Map<string, ConstellationContributorIds>;
}): ConstellationLayout {
  const nowMs = input.nowMs ?? Date.now();
  const ageWindowDays = input.ageWindowDays ?? DEFAULT_AGE_WINDOW_DAYS;
  const contributorAnchors = input.constellationLinks
    ? buildContributorAnchorMap(input.breakthroughs, input.constellationLinks)
    : new Map<string, number>();

  // Goals: angle = hash by goal id (each goal is a stable direction).
  const positionedGoals: Positioned<GoalDot>[] = input.goals.map((g) => {
    const angle = hashFloat(g.id, 41) * Math.PI * 2;
    const distance =
      distanceFromCenter(g.lastEngagedAt, nowMs, ageWindowDays) +
      jitter(g.id, 43, 0.015);
    const { x, y } = polarToXY(angle, distance);
    return {
      ...g,
      x: clampPanel(x),
      y: clampPanel(y),
      opacity: recencyOpacity(g.lastEngagedAt, nowMs, ageWindowDays),
    };
  });

  // Sessions: angle anchored to primary breakthrough wedge if the
  // session is a contributor; hash-random freelancer otherwise.
  const positionedSessions: Positioned<SessionDot>[] = input.sessions.map(
    (s) => {
      const anchor = contributorAnchors.get(s.id);
      const angle =
        anchor !== undefined
          ? anchor + (hashFloat(s.id, 11) - 0.5) * CONSTELLATION_WEDGE_RAD
          : hashFloat(s.id, 11) * Math.PI * 2;
      const distance =
        distanceFromCenter(s.endedAt, nowMs, ageWindowDays) +
        jitter(s.id, 19, 0.015);
      const { x, y } = polarToXY(angle, distance);
      return {
        ...s,
        x: clampPanel(x),
        y: clampPanel(y),
        opacity: recencyOpacity(s.endedAt, nowMs, ageWindowDays),
      };
    },
  );

  // Breakthroughs: angle = hash by breakthrough id (the constellation
  // anchors). Distance = age. A breakthrough stands as its own moment.
  const positionedBreakthroughs: Positioned<BreakthroughDot>[] =
    input.breakthroughs.map((b) => {
      const angle = angleForBreakthrough(b.id);
      const distance =
        distanceFromCenter(b.createdAt, nowMs, ageWindowDays) +
        jitter(b.id, 23, 0.02);
      const { x, y } = polarToXY(angle, distance);
      return {
        ...b,
        x: clampPanel(x),
        y: clampPanel(y),
        opacity: recencyOpacity(b.createdAt, nowMs, ageWindowDays),
      };
    });

  // Mindset shifts: same anchor-vs-freelancer behavior as sessions.
  // When a shift contributes to a breakthrough, its angle clusters
  // in that breakthrough's wedge.
  const positionedShifts: Positioned<MindsetShiftDot>[] =
    input.mindsetShifts.map((m) => {
      const anchor = contributorAnchors.get(m.id);
      const angle =
        anchor !== undefined
          ? anchor + (hashFloat(m.id, 13) - 0.5) * CONSTELLATION_WEDGE_RAD
          : hashFloat(m.id, 13) * Math.PI * 2;
      const distance =
        distanceFromCenter(m.createdAt, nowMs, ageWindowDays) +
        jitter(m.id, 29, 0.02);
      const { x, y } = polarToXY(angle, distance);
      return {
        ...m,
        x: clampPanel(x),
        y: clampPanel(y),
        opacity: recencyOpacity(m.createdAt, nowMs, ageWindowDays),
      };
    });

  return {
    sessions: positionedSessions,
    breakthroughs: positionedBreakthroughs,
    mindsetShifts: positionedShifts,
    goals: positionedGoals,
  };
}

// Keep stars inside the panel with a small inset so they never sit
// flush against the rounded corners. Max distance from center is
// OUTER_RING_FRAC + jitter; the inset here is the safety margin
// after polar→cartesian conversion.
function clampPanel(v: number): number {
  if (v < 0.04) return 0.04;
  if (v > 0.96) return 0.96;
  return v;
}

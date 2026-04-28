// Pure layout functions for the Progress-tab constellation. No DOM,
// no React, no Supabase — just deterministic math so the visual
// layout is stable across renders and easy to unit-test.
//
// V3 GALAXY MODEL (current):
//   The user's universe is made of galaxies. Each breakthrough is the
//   sun of its own galaxy; the sessions and mindset shifts that led to
//   that breakthrough orbit it as a tight local cluster. After each
//   breakthrough, new sessions/shifts start scattering in the
//   "in-progress" region near the universe center, building the
//   foundation for the next galaxy.
//
//   Universe center = (0.5, 0.5). Each galaxy's CENTER (its sun) sits
//   at polar coords from the universe center:
//     - angle: hash-stable per breakthrough id, so a galaxy keeps the
//       same direction in the sky over time.
//     - distance: damped-exponential function of age. New galaxies sit
//       close in; old galaxies asymptote toward the outer edge but
//       never quite reach it. Slow expansion is intentional — the
//       universe shouldn't fly apart.
//
//   Each contributing star (session or shift) sits at polar coords
//   FROM ITS GALAXY'S CENTER, not from the universe center. This is
//   what makes a galaxy read as a unit when zoomed out.
//
//   In-progress stars (sessions/shifts not yet in any galaxy) live
//   near the universe center in a small inner region. They're the
//   foundation of the next galaxy.
//
// V2 RADIAL MODEL (previous, replaced by V3):
//   Single-center radial. Distance = age. All stars radiated from one
//   point. Cluster wedges around breakthroughs gave a hint of grouping
//   but lacked the "multiple-galactic-center" feel V3 needs.

export type SessionDot = {
  id: string;
  endedAt: string;
  // AI-written one-line summary (progress_summary_short). Used as
  // the dot's hover title. Empty string for demo data without a
  // title stub.
  title?: string;
};

export type BreakthroughDot = {
  id: string;
  sessionId: string;
  content: string;
  createdAt: string;
  // V.7.1 evocative constellation name. Preferred over content for
  // dot tooltips and labels. Optional for demo data.
  galaxyName?: string;
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
  // Stored progress_percent (0-100) at the goal's most recent
  // session-engagement. Optional so demo data and call sites that
  // haven't migrated yet keep working — they fall back to recency.
  progressPercent?: number | null;
  completionType?: "milestone" | "practice";
};

export type Positioned<T> = T & {
  x: number; // 0–1 fraction of panel width
  y: number; // 0–1 fraction of panel height
  opacity: number; // 0.15–1.0 recency fade
};

// Goals are comets — they wander the universe, not bound to any
// galaxy, with a visible tail trailing behind. The renderer draws
// the head at (x,y) and a fading streak in the direction opposite
// to (cos(tailAngle), sin(tailAngle)).
export type PositionedGoal = Positioned<GoalDot> & {
  tailAngle: number; // radians; the direction the tail points
  tailLength: number; // 0–1 panel-fraction units
};

// Per-galaxy descriptor. Holds the breakthrough's universe-coord
// position (already in Positioned<BreakthroughDot>) plus the visible
// galaxy radius the renderer should draw the nebula glow at.
export type GalaxyMeta = {
  breakthroughId: string;
  centerX: number;
  centerY: number;
  // Radius in panel-fraction units. Scales with member count so a
  // galaxy with many contributors gets a wider nebula.
  radius: number;
  memberCount: number;
};

export type ConstellationLayout = {
  sessions: Positioned<SessionDot>[];
  breakthroughs: Positioned<BreakthroughDot>[];
  mindsetShifts: Positioned<MindsetShiftDot>[];
  goals: PositionedGoal[];
  // One entry per breakthrough — used by the renderer to draw the
  // nebula glow + (optionally) a label at the galaxy's local center.
  galaxies: GalaxyMeta[];
};

// FNV-1a-ish 32-bit hash → 0..1 float. Stable across runs; used to
// pick stable random angles and within-galaxy positions.
export function hashFloat(input: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

import {
  progressForBreakthrough,
  progressForGoal,
  progressForSession,
  progressForShift,
  progressToOpacity,
} from "@/lib/progress";

// Default time window (days) used by the recency-opacity curve.
// Distance-from-center is governed by GALAXY_AGE_TAU separately;
// this only controls how brightness fades with age.
export const DEFAULT_AGE_WINDOW_DAYS = 120;

// Recency curve quantized into 10 distinct dimness levels so the
// difference between "fresh", "a couple weeks ago", "a month or so",
// "few months", "old" reads clearly at a glance. Linear ramp from
// 1.0 → 0.10 across the window (older = pinned at floor 0.10).
const RECENCY_LEVELS = 10;
const RECENCY_FLOOR = 0.10;

export function recencyOpacity(
  whenIso: string | null,
  nowMs: number = Date.now(),
  ageWindowDays: number = DEFAULT_AGE_WINDOW_DAYS,
): number {
  if (!whenIso) return RECENCY_FLOOR;
  const ageDays = Math.max(0, (nowMs - Date.parse(whenIso)) / 86_400_000);
  const t = Math.min(1, ageDays / ageWindowDays);
  // Snap continuous t into N+1 discrete levels (0..N), then map to
  // the visible opacity range.
  const level = Math.round(t * RECENCY_LEVELS);
  const continuous = 1 - level / RECENCY_LEVELS;
  return Math.max(RECENCY_FLOOR, continuous);
}

// Universe-level layout constants (panel-fraction units; the panel is
// 1.0 wide × 1.0 tall, centered at 0.5,0.5).
//
// Galaxy distance from universe center = damped exponential of age:
//   d(age) = NEW + (OLD - NEW) * (1 - exp(-age / TAU))
// At age=0, d=NEW (close in). As age→∞, d→OLD (asymptote, never
// quite reaches the outer ring). TAU lengthened so galaxies don't
// all pile up at the asymptote — at 365 days, a 365-day-old galaxy
// is ~63% of the way out, so the user's whole-history view shows
// galaxies actually spread across the radial range instead of
// stacked into a ring.
const GALAXY_NEW_DIST = 0.17;
const GALAXY_OLD_DIST = 0.46;
const GALAXY_AGE_TAU_DAYS = 240;
// Per-galaxy radial jitter — breaks the perfect-ring effect so
// galaxies of similar age don't all sit at the exact same distance
// from the universe center.
const GALAXY_RADIAL_JITTER = 0.05;

// Within-galaxy scatter is a true 2D Gaussian centered on the sun.
// σ is sized so the typical inter-dot Gaussian distance exceeds
// MIN_MEMBER_SEPARATION even for moderate galaxies — otherwise the
// relaxation pass dominates and the result settles back into a
// uniform disc (this was the V4 bug: σ=0.05 gave ~0.057 typical
// spacing, just below the 0.06 threshold, so relaxation flattened
// the bulge). Now: dense bulge near the sun, density falling off
// with a long halo tail, instead of a flat ring at the rim.
const MEMBER_SIGMA_BASE = 0.030;
const MEMBER_SIGMA_PER_SQRT = 0.010;
// Minimum distance from a member to its galaxy's sun. The sun's
// halo + the member dot's own radius sit roughly inside this; below
// it, members render under the halo and become impossible to tap.
const GALAXY_CORE_RADIUS = 0.05;
// Visible nebula radius for the renderer's glow. Scales with sqrt(n)
// so it tracks the actual member spread (≈ 2σ captures 95% of dots).
// Cap raised vs V4 so big galaxies' halo glow tracks the wider
// scatter, but old galaxies still don't clip the panel edge given
// the GALAXY_OLD_DIST = 0.46 cap.
const GALAXY_HALO_RADIUS_BASE = 0.06;
const GALAXY_HALO_RADIUS_PER_SQRT = 0.018;
const GALAXY_HALO_RADIUS_MAX = 0.13;
// Minimum visual separation between two members (panel-fraction).
// Lowered from 0.06 (V4) to 0.04 so the Gaussian's natural density
// shows through — at 0.06 the relaxation pass was forcing every
// pair apart and re-creating a uniform-disc layout. 0.04 still
// keeps two dots visually distinct (their visible discs don't
// overlap); the user can pinch-zoom to tap individual stars in a
// dense cluster, which is the natural gesture for a "galaxy."
const MIN_MEMBER_SEPARATION = 0.04;
// Galaxy aspect ratio range. Each galaxy gets a random aspect from
// MIN..1 along one axis, simulating that we're seeing it from a
// different angle than the others. Combined with the per-galaxy
// rotation this gives each galaxy a visibly distinct shape rather
// than every one reading as the same circle.
const GALAXY_ASPECT_MIN = 0.55;

// In-progress region — sessions/shifts not yet in any galaxy live
// near the universe center, the foundation of the next galaxy.
// Same Gaussian recipe as galaxy members but slightly tighter (no
// sun anchoring it, so it should read as a forming cluster rather
// than a fully-spread galaxy).
const INPROGRESS_SIGMA_BASE = 0.025;
const INPROGRESS_SIGMA_PER_SQRT = 0.008;
const INPROGRESS_MIN_DIST = 0.025;

function galaxyDistanceFromUniverseCenter(
  breakthroughId: string,
  createdAtIso: string,
  nowMs: number,
): number {
  const ageDays = Math.max(0, (nowMs - Date.parse(createdAtIso)) / 86_400_000);
  const t = 1 - Math.exp(-ageDays / GALAXY_AGE_TAU_DAYS);
  const base = GALAXY_NEW_DIST + t * (GALAXY_OLD_DIST - GALAXY_NEW_DIST);
  const radialJitter =
    (hashFloat(breakthroughId, 67) - 0.5) * 2 * GALAXY_RADIAL_JITTER;
  // Clamp into a safe band so a jittered galaxy never crosses into
  // the in-progress region or off the panel.
  return Math.max(
    GALAXY_NEW_DIST - 0.02,
    Math.min(GALAXY_OLD_DIST + 0.04, base + radialJitter),
  );
}

function galaxyVisibleRadius(memberCount: number): number {
  return Math.min(
    GALAXY_HALO_RADIUS_MAX,
    GALAXY_HALO_RADIUS_BASE +
      Math.sqrt(memberCount) * GALAXY_HALO_RADIUS_PER_SQRT,
  );
}

// Box-Muller magnitude — converts a uniform u ∈ (0,1] into a sample
// from a standard half-normal distribution. Combined with a uniform
// angle this gives a 2D Gaussian scatter around the origin: dense
// near the center, falling off smoothly with a long tail. Floor on
// u keeps the result finite for hash collisions at the boundary.
function gaussianMagnitude(u: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-4, u)));
}

function polarToXY(
  cx: number,
  cy: number,
  angleRad: number,
  distance: number,
): { x: number; y: number } {
  return {
    x: cx + Math.cos(angleRad) * distance,
    y: cy + Math.sin(angleRad) * distance,
  };
}

// Tiny radial jitter so multiple items at the exact same coords don't
// stack perfectly. Hash-derived per item for stability.
function jitter(id: string, seed: number, scale: number): number {
  return (hashFloat(id, seed) - 0.5) * scale * 2;
}

// Narrow shape of constellation links the layout function cares
// about — just contributor lists keyed by breakthrough id. Demo data
// and (V.5a) real data both satisfy this.
type ConstellationContributorIds = {
  sessionIds: string[];
  shiftIds: string[];
};

// Galaxy angles are assigned by sorting breakthroughs on a stable
// hash, then snapping each to an evenly-spaced slot around the
// circle. This guarantees angular spacing of 2π/N between adjacent
// galaxies — they can never cluster on the same side of the
// universe. A small per-galaxy hash-jitter keeps the distribution
// from looking perfectly clock-arrayed.
//
// Public-facing helper kept for callers that need a pre-computed
// angle outside the layout (e.g. demo anchoring); retained for API
// compatibility but no longer drives the position itself.
export function angleForBreakthrough(id: string): number {
  return hashFloat(id, 7) * Math.PI * 2;
}

const SLOT_ANGULAR_JITTER = 0.18; // radians, ~10°

type GalaxyCenter = {
  breakthroughId: string;
  cx: number;
  cy: number;
  radius: number;
  memberIds: string[]; // session + shift ids that belong here
};

function buildGalaxyCenters(
  breakthroughs: BreakthroughDot[],
  links: Map<string, ConstellationContributorIds>,
  nowMs: number,
): GalaxyCenter[] {
  if (breakthroughs.length === 0) return [];
  // Stable hash-ordering of breakthroughs → evenly-spaced angular
  // slot. Same input always yields the same slot.
  const slotByBreakthroughId = new Map<string, number>();
  const ordered = [...breakthroughs]
    .map((b) => ({ id: b.id, h: hashFloat(b.id, 13) }))
    .sort((a, b) => a.h - b.h);
  ordered.forEach((o, idx) => slotByBreakthroughId.set(o.id, idx));
  const N = breakthroughs.length;

  return breakthroughs.map((b) => {
    const cl = links.get(b.id);
    const sessionIds = cl?.sessionIds ?? [];
    const shiftIds = cl?.shiftIds ?? [];
    const memberCount = sessionIds.length + shiftIds.length;
    const slot = slotByBreakthroughId.get(b.id) ?? 0;
    const slotAngle = (slot / N) * Math.PI * 2;
    const angleJitter =
      (hashFloat(b.id, 19) - 0.5) * 2 * SLOT_ANGULAR_JITTER;
    const angle = slotAngle + angleJitter;
    const dist = galaxyDistanceFromUniverseCenter(b.id, b.createdAt, nowMs);
    const { x: cx, y: cy } = polarToXY(0.5, 0.5, angle, dist);
    return {
      breakthroughId: b.id,
      cx,
      cy,
      radius: galaxyVisibleRadius(memberCount),
      memberIds: [...sessionIds, ...shiftIds],
    };
  });
}

// Position galaxy members as a Gaussian scatter around the sun: a
// dense bulge tapering off into a thinner halo. Each galaxy gets its
// own random aspect + rotation so neighboring galaxies look visibly
// distinct rather than reading as uniform circles. σ grows with
// sqrt(memberCount) so a busy galaxy spreads naturally without
// blowing up. A light relaxation pass then nudges apart any pairs
// the Gaussian happened to land too close together.
function buildMemberPositions(
  galaxies: GalaxyCenter[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  for (const galaxy of galaxies) {
    if (galaxy.memberIds.length === 0) continue;
    const sorted = [...galaxy.memberIds].sort();
    const sigma =
      MEMBER_SIGMA_BASE +
      MEMBER_SIGMA_PER_SQRT * Math.sqrt(sorted.length);

    // Per-galaxy ellipse: aspect from MIN..1, rotation 0..π.
    const aspect =
      GALAXY_ASPECT_MIN +
      hashFloat(galaxy.breakthroughId, 47) * (1 - GALAXY_ASPECT_MIN);
    const rotation = hashFloat(galaxy.breakthroughId, 53) * Math.PI;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const positions = sorted.map((id) => {
      const angle = hashFloat(id, 81) * Math.PI * 2;
      const r = Math.max(
        GALAXY_CORE_RADIUS,
        sigma * gaussianMagnitude(hashFloat(id, 83)),
      );
      // Local ellipse coords (long axis = X, short axis = Y * aspect).
      const lx = Math.cos(angle) * r;
      const ly = Math.sin(angle) * r * aspect;
      // Rotate into world coords around the sun.
      const dx = lx * cosR - ly * sinR;
      const dy = lx * sinR + ly * cosR;
      return { id, x: galaxy.cx + dx, y: galaxy.cy + dy };
    });

    relaxPositions(positions);

    for (const p of positions) {
      result.set(p.id, { x: p.x, y: p.y });
    }
  }
  return result;
}

// Relaxation — push overlapping pairs apart. The Gaussian scatter
// already spaces most pairs naturally; this just resolves the few
// that landed too close. 4 passes is enough for that, less than the
// 6 we used when the input was a uniform-radial scatter.
function relaxPositions(positions: { x: number; y: number }[]): void {
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MIN_MEMBER_SEPARATION && dist > 1e-6) {
          const push = (MIN_MEMBER_SEPARATION - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }
}

// Position the in-progress region — sessions/shifts not yet in any
// galaxy. Same Gaussian recipe as galaxy members but centered on
// the universe origin (0.5, 0.5) and slightly tighter, since this
// is the cluster gathering toward the next breakthrough rather than
// an already-formed galaxy with a sun at the center.
function buildInProgressPositions(
  ids: string[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (ids.length === 0) return result;
  const sorted = [...ids].sort();
  const sigma =
    INPROGRESS_SIGMA_BASE +
    INPROGRESS_SIGMA_PER_SQRT * Math.sqrt(sorted.length);
  const positions = sorted.map((id) => {
    const angle = hashFloat(id, 91) * Math.PI * 2;
    const r = Math.max(
      INPROGRESS_MIN_DIST,
      sigma * gaussianMagnitude(hashFloat(id, 93)),
    );
    return {
      id,
      x: 0.5 + Math.cos(angle) * r,
      y: 0.5 + Math.sin(angle) * r,
    };
  });
  relaxPositions(positions);
  for (const p of positions) result.set(p.id, { x: p.x, y: p.y });
  return result;
}

export function computeLayout(input: {
  sessions: SessionDot[];
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
  nowMs?: number;
  ageWindowDays?: number;
  constellationLinks?: Map<string, ConstellationContributorIds>;
}): ConstellationLayout {
  const nowMs = input.nowMs ?? Date.now();
  const ageWindowDays = input.ageWindowDays ?? DEFAULT_AGE_WINDOW_DAYS;
  const links = input.constellationLinks ?? new Map();

  const galaxyCenters = buildGalaxyCenters(input.breakthroughs, links, nowMs);
  const galaxyById = new Map(galaxyCenters.map((g) => [g.breakthroughId, g]));
  // Pre-compute every galaxy member's (x, y) — random-scattered with
  // density falloff and within-galaxy collision avoidance.
  const memberPositions = buildMemberPositions(galaxyCenters);

  // Sessions/shifts not in any galaxy are "in-progress" — they live
  // near the universe center, foundation for the next breakthrough.
  // Same hash-scatter + relaxation treatment as galaxy members so
  // the in-progress region doesn't pile up into a dense blob.
  const inProgressIds: string[] = [];
  for (const s of input.sessions) {
    if (!memberPositions.has(s.id)) inProgressIds.push(s.id);
  }
  for (const m of input.mindsetShifts) {
    if (!memberPositions.has(m.id)) inProgressIds.push(m.id);
  }
  const inProgressPositions = buildInProgressPositions(inProgressIds);

  // Goals are comets — they wander the universe independent of any
  // galaxy. Each goal gets a hash-derived head position somewhere in
  // the open sky and a hash-derived travel direction the tail trails
  // behind. Head position avoids the dense in-progress core and the
  // galaxy ring by living in a mid-radius band, with enough angular
  // jitter to feel scattered. The tail length grows with engagement
  // recency — a freshly-touched goal has a longer streak.
  // Slow daily orbit. Each comet rotates around the universe center
  // at a hash-derived radius (set below) and a hash-derived angular
  // velocity that averages ~1 full orbit per year. Quantized to UTC
  // day boundaries so the position ticks once per day rather than
  // animating continuously — the user opens the app, the comets are
  // somewhere slightly different than yesterday. Per-comet speed
  // varies ±25% so they don't rotate in lockstep.
  const ORBIT_BASE_PERIOD_DAYS = 365;
  const dayIndex = Math.floor(nowMs / 86_400_000);

  const positionedGoals: PositionedGoal[] = input.goals.map((g) => {
    const baseAngle = hashFloat(g.id, 41) * Math.PI * 2;
    // Per-comet orbital period, hash-derived so each comet's speed
    // is stable across renders. Range ~273-456 days (3/4 to 5/4 of
    // base) — visible variety without feeling chaotic.
    const periodDays = ORBIT_BASE_PERIOD_DAYS * (0.75 + hashFloat(g.id, 59) * 0.5);
    const orbitOffset = (dayIndex / periodDays) * Math.PI * 2;
    const headAngle = baseAngle + orbitOffset;
    const headDist =
      0.22 + hashFloat(g.id, 47) * 0.14 + jitter(g.id, 43, 0.01);
    const { x, y } = polarToXY(0.5, 0.5, headAngle, headDist);
    // Tail direction: separate hash so the tail doesn't always point
    // toward the universe center. Adds ~30° of variation around the
    // "trailing behind the orbit" baseline. Inherits the orbital
    // rotation via headAngle so the tail re-orients with the comet.
    const tailAngle =
      headAngle + Math.PI + (hashFloat(g.id, 53) - 0.5) * (Math.PI / 3);
    // Opacity tracks the unified-progress value for this goal so the
    // map matches the bar in the goals tab. Falls back to legacy
    // recency curve when the caller hasn't supplied progress fields
    // (older demo paths).
    const op =
      g.completionType !== undefined
        ? progressToOpacity(
            progressForGoal(
              g.progressPercent,
              g.lastEngagedAt,
              g.completionType,
              nowMs,
            ),
          )
        : recencyOpacity(g.lastEngagedAt, nowMs, ageWindowDays);
    const tailLength = 0.035 + op * 0.06;
    return {
      ...g,
      x: clampPanel(x),
      y: clampPanel(y),
      opacity: op,
      tailAngle,
      tailLength,
    };
  });

  // Relax goal head positions so two comets can't render on top of
  // each other (a click then resolves only the top one). Goal tails
  // can extend ~0.10 of panel width, so we push heads apart with a
  // wider separation than the dot-based MIN_MEMBER_SEPARATION used
  // for sessions/shifts.
  if (positionedGoals.length > 1) {
    const GOAL_MIN_SEPARATION = 0.07;
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < positionedGoals.length; i++) {
        for (let j = i + 1; j < positionedGoals.length; j++) {
          const a = positionedGoals[i];
          const b = positionedGoals[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < GOAL_MIN_SEPARATION && d > 1e-6) {
            const push = (GOAL_MIN_SEPARATION - d) / 2;
            const nx = dx / d;
            const ny = dy / d;
            a.x = clampPanel(a.x - nx * push);
            a.y = clampPanel(a.y - ny * push);
            b.x = clampPanel(b.x + nx * push);
            b.y = clampPanel(b.y + ny * push);
          }
        }
      }
    }
  }

  // Sessions / shifts / breakthroughs: opacity tracks the unified-
  // progress value for that entity so the map's brightness matches
  // the progress bar in the corresponding card.
  const positionedSessions: Positioned<SessionDot>[] = input.sessions.map(
    (s) => {
      const slot =
        memberPositions.get(s.id) ?? inProgressPositions.get(s.id);
      const opacity = progressToOpacity(progressForSession(s.endedAt, nowMs));
      if (!slot) {
        return { ...s, x: 0.5, y: 0.5, opacity };
      }
      return { ...s, x: clampPanel(slot.x), y: clampPanel(slot.y), opacity };
    },
  );

  const positionedBreakthroughs: Positioned<BreakthroughDot>[] =
    input.breakthroughs.map((b) => {
      const galaxy = galaxyById.get(b.id);
      const x = galaxy ? galaxy.cx : 0.5;
      const y = galaxy ? galaxy.cy : 0.5;
      return {
        ...b,
        x: clampPanel(x),
        y: clampPanel(y),
        opacity: progressToOpacity(progressForBreakthrough(b.createdAt, nowMs)),
      };
    });

  const positionedShifts: Positioned<MindsetShiftDot>[] =
    input.mindsetShifts.map((m) => {
      const slot =
        memberPositions.get(m.id) ?? inProgressPositions.get(m.id);
      const opacity = progressToOpacity(progressForShift(m.createdAt, nowMs));
      if (!slot) {
        return { ...m, x: 0.5, y: 0.5, opacity };
      }
      return { ...m, x: clampPanel(slot.x), y: clampPanel(slot.y), opacity };
    });

  const galaxies: GalaxyMeta[] = galaxyCenters.map((g) => ({
    breakthroughId: g.breakthroughId,
    centerX: g.cx,
    centerY: g.cy,
    radius: g.radius,
    memberCount: g.memberIds.length,
  }));

  return {
    sessions: positionedSessions,
    breakthroughs: positionedBreakthroughs,
    mindsetShifts: positionedShifts,
    goals: positionedGoals,
    galaxies,
  };
}

// Keep stars inside the panel with a small inset so they never sit
// flush against the rounded corners.
function clampPanel(v: number): number {
  if (v < 0.04) return 0.04;
  if (v > 0.96) return 0.96;
  return v;
}

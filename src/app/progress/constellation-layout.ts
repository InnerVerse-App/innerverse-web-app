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

// Within-galaxy radius. Members scatter around the sun across this
// range, with denser packing near the core and sparser at the rim
// to evoke an elliptical galaxy's profile. Tighter than V2 so
// neighboring galaxies have visible empty space between them.
const GALAXY_CORE_RADIUS = 0.015;
const GALAXY_HALO_RADIUS_BASE = 0.045;
const GALAXY_HALO_RADIUS_PER_MEMBER = 0.0010;
const GALAXY_HALO_RADIUS_MAX = 0.07;
// Minimum visual separation between two members (panel-fraction).
const MIN_MEMBER_SEPARATION = 0.016;
// Density-falloff exponent. < 1 biases toward the core (denser
// center). 0.4 is a strong-bulge cluster — clear core with the
// outer halo only sparsely populated.
const MEMBER_DENSITY_EXPONENT = 0.4;
// Galaxy aspect ratio range. Each galaxy gets a random aspect from
// MIN..1 along one axis, simulating that we're seeing it from a
// different angle than the others. Combined with the per-galaxy
// rotation this gives each galaxy a visibly distinct shape rather
// than every one reading as the same circle.
const GALAXY_ASPECT_MIN = 0.55;

// In-progress region — sessions/shifts not yet in any galaxy live
// near the universe center, scattered within this radius.
const INPROGRESS_MAX_DIST = 0.10;
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
    GALAXY_HALO_RADIUS_BASE + memberCount * GALAXY_HALO_RADIUS_PER_MEMBER,
  );
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

// Position galaxy members as a random scatter around the sun with
// density falling off toward the rim. Each galaxy has its own
// random aspect ratio + rotation, simulating that we're seeing it
// from a slightly different angle than its neighbors — so galaxies
// look visibly distinct from each other rather than all reading as
// uniform circles. After the initial scatter, run a relaxation pass
// to push apart any pairs closer than MIN_MEMBER_SEPARATION.
function buildMemberPositions(
  galaxies: GalaxyCenter[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  for (const galaxy of galaxies) {
    if (galaxy.memberIds.length === 0) continue;
    const sorted = [...galaxy.memberIds].sort();

    // Per-galaxy ellipse: aspect from MIN..1, rotation 0..2π.
    const aspect =
      GALAXY_ASPECT_MIN +
      hashFloat(galaxy.breakthroughId, 47) * (1 - GALAXY_ASPECT_MIN);
    const rotation = hashFloat(galaxy.breakthroughId, 53) * Math.PI;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    // Initial hash-based scatter in ellipse-local coords, rotated
    // into world coords.
    const positions = sorted.map((id) => {
      const angle = hashFloat(id, 81) * Math.PI * 2;
      const u = hashFloat(id, 83);
      const t = Math.pow(u, MEMBER_DENSITY_EXPONENT);
      const r =
        GALAXY_CORE_RADIUS + t * (galaxy.radius - GALAXY_CORE_RADIUS);
      // Local ellipse coords (long axis = X, short axis = Y * aspect).
      const lx = Math.cos(angle) * r;
      const ly = Math.sin(angle) * r * aspect;
      // Rotate into world coords around the sun.
      const dx = lx * cosR - ly * sinR;
      const dy = lx * sinR + ly * cosR;
      return { id, x: galaxy.cx + dx, y: galaxy.cy + dy };
    });

    // Relaxation — push overlapping pairs apart. 6 passes
    // typically resolves a galaxy's worth of stars.
    for (let pass = 0; pass < 6; pass++) {
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

    for (const p of positions) {
      result.set(p.id, { x: p.x, y: p.y });
    }
  }
  return result;
}

// Position the in-progress region — sessions/shifts not yet in any
// galaxy. Same recipe as galaxy members: hash-scatter, then run
// relaxation so nothing overlaps. Lives in a small disc near the
// universe center.
function buildInProgressPositions(
  ids: string[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (ids.length === 0) return result;
  const sorted = [...ids].sort();
  const positions = sorted.map((id) => {
    const angle = hashFloat(id, 91) * Math.PI * 2;
    const u = hashFloat(id, 93);
    const t = Math.pow(u, 0.6);
    const dist = INPROGRESS_MIN_DIST + t * (INPROGRESS_MAX_DIST - INPROGRESS_MIN_DIST);
    return {
      id,
      x: 0.5 + Math.cos(angle) * dist,
      y: 0.5 + Math.sin(angle) * dist,
    };
  });
  for (let pass = 0; pass < 5; pass++) {
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
  const positionedGoals: PositionedGoal[] = input.goals.map((g) => {
    const headAngle = hashFloat(g.id, 41) * Math.PI * 2;
    const headDist =
      0.22 + hashFloat(g.id, 47) * 0.14 + jitter(g.id, 43, 0.01);
    const { x, y } = polarToXY(0.5, 0.5, headAngle, headDist);
    // Tail direction: separate hash so the tail doesn't always point
    // toward the universe center. Adds ~30° of variation around the
    // "trailing behind the orbit" baseline.
    const tailAngle =
      headAngle + Math.PI + (hashFloat(g.id, 53) - 0.5) * (Math.PI / 3);
    const op = recencyOpacity(g.lastEngagedAt, nowMs, ageWindowDays);
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

  // Sessions: positioned inside their galaxy if they're a contributor;
  // otherwise scattered in the in-progress inner region.
  const positionedSessions: Positioned<SessionDot>[] = input.sessions.map(
    (s) => {
      const slot =
        memberPositions.get(s.id) ?? inProgressPositions.get(s.id);
      if (!slot) {
        return {
          ...s,
          x: 0.5,
          y: 0.5,
          opacity: recencyOpacity(s.endedAt, nowMs, ageWindowDays),
        };
      }
      return {
        ...s,
        x: clampPanel(slot.x),
        y: clampPanel(slot.y),
        opacity: recencyOpacity(s.endedAt, nowMs, ageWindowDays),
      };
    },
  );

  // Breakthroughs: positioned at their galaxy's center (the sun).
  const positionedBreakthroughs: Positioned<BreakthroughDot>[] =
    input.breakthroughs.map((b) => {
      const galaxy = galaxyById.get(b.id);
      const x = galaxy ? galaxy.cx : 0.5;
      const y = galaxy ? galaxy.cy : 0.5;
      return {
        ...b,
        x: clampPanel(x),
        y: clampPanel(y),
        opacity: recencyOpacity(b.createdAt, nowMs, ageWindowDays),
      };
    });

  // Mindset shifts: same galaxy-vs-in-progress logic as sessions,
  // with a different seed so shifts and sessions don't collide on
  // identical local positions inside a galaxy.
  const positionedShifts: Positioned<MindsetShiftDot>[] =
    input.mindsetShifts.map((m) => {
      const slot =
        memberPositions.get(m.id) ?? inProgressPositions.get(m.id);
      if (!slot) {
        return {
          ...m,
          x: 0.5,
          y: 0.5,
          opacity: recencyOpacity(m.createdAt, nowMs, ageWindowDays),
        };
      }
      return {
        ...m,
        x: clampPanel(slot.x),
        y: clampPanel(slot.y),
        opacity: recencyOpacity(m.createdAt, nowMs, ageWindowDays),
      };
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

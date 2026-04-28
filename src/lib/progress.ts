// Unified progress model. All four entity types — sessions, mindset
// shifts, breakthroughs, goals — express their current state on the
// same 0–100 scale (raw integer; the user never sees the number,
// just the bar/star brightness derived from it).
//
// Sessions / shifts / breakthroughs:
//   * Created at full strength (100).
//   * Decay 1 point per 24 hours since creation. Bottoms out at 0
//     after 100 days.
//
// Goals:
//   * Stored progress_percent on the row, anchored by last_engaged_at.
//   * Each session adds the sum of linked theme intensities to
//     progress_percent (capped at 100) — see process_session_end.
//   * Practice goals decay 1 point per 72 hours since last_engaged_at.
//   * Milestone goals don't decay.
//
// Star map opacity also derives from the same 0–100 value, mapped
// onto the [0.15, 1.0] range so even fully-decayed dots are still
// faintly visible.

const SESSION_DECAY_HOURS = 24;
const SHIFT_DECAY_HOURS = 24;
const BREAKTHROUGH_DECAY_HOURS = 24;
const GOAL_PRACTICE_DECAY_HOURS = 72;

const MS_PER_HOUR = 3_600_000;

function clampUnit(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function hoursSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - then) / MS_PER_HOUR);
}

// Time-since-creation progress on a 0–100 scale, decaying at one
// point per `decayHours`.
function progressFromAge(
  createdAtIso: string | null | undefined,
  decayHours: number,
  nowMs: number,
): number {
  const hours = hoursSince(createdAtIso, nowMs);
  if (!isFinite(hours)) return 0;
  return clampUnit(100 - hours / decayHours);
}

export function progressForSession(
  endedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  return progressFromAge(endedAt, SESSION_DECAY_HOURS, nowMs);
}

export function progressForShift(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  return progressFromAge(createdAt, SHIFT_DECAY_HOURS, nowMs);
}

export function progressForBreakthrough(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  return progressFromAge(createdAt, BREAKTHROUGH_DECAY_HOURS, nowMs);
}

export function progressForGoal(
  storedProgressPercent: number | null | undefined,
  lastEngagedAt: string | null | undefined,
  completionType: "milestone" | "practice",
  nowMs: number = Date.now(),
): number {
  const stored = clampUnit(storedProgressPercent ?? 0);
  if (completionType === "milestone") return stored;
  // Practice: subtract 1 point per GOAL_PRACTICE_DECAY_HOURS since
  // last_engaged_at. If never engaged, stored is 0 anyway.
  const decayed = stored - hoursSince(lastEngagedAt, nowMs) / GOAL_PRACTICE_DECAY_HOURS;
  return clampUnit(decayed);
}

// Map a 0–100 progress value to a 0.15–1.0 opacity for star-map dots.
// Floor of 0.15 keeps fully-decayed dots faintly visible so the user
// can still see the structure.
export function progressToOpacity(progress: number): number {
  const p = clampUnit(progress);
  return 0.15 + (p / 100) * 0.85;
}

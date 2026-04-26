// Demo-mode mock data for the Progress-tab constellation. Triggered
// by the `?demo=1` query param on /progress. Lets the operator
// visually preview the constellation without seeding real DB rows.
//
// Dates are computed relative to "now" so the constellation always
// looks current regardless of when this file was written. The
// returned data shape matches what the real DB readers produce.
//
// SCALE: 500 days of content (~100 sessions, ~130 mindset shifts,
// ~25 breakthroughs, 10 goals) so the operator can stress-test the
// time-window pills, pinch-zoom, and visual density on real-ish
// volume.

import {
  type BreakthroughDot,
  type GoalDot,
  hashFloat,
  type MindsetShiftDot,
  type SessionDot,
} from "./constellation-layout";

const DAY_MS = 86_400_000;

function daysAgoIso(days: number, hours = 10): string {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setUTCHours(hours, 0, 0, 0);
  return d.toISOString();
}

// A breakthrough's constellation — sessions and mindset shifts that
// led to it, plus a distinct evocative name. Goals are intentionally
// NOT contributors: per the influence model, goals are caused by
// breakthroughs, not the other way around.
export type ConstellationLinks = {
  name: string;
  sessionIds: string[];
  shiftIds: string[];
};

// A mindset shift's contributors — only sessions that built up to
// the shift. Shifts don't get a separate "name" (only breakthroughs
// get named constellations).
export type MindsetShiftLinks = {
  sessionIds: string[];
};

// A goal's contributors — sessions worked, mindset shifts that
// progressed it, and breakthroughs that landed in its theme.
export type GoalLinks = {
  sessionIds: string[];
  shiftIds: string[];
  breakthroughIds: string[];
};

const TOTAL_DAYS = 500;
const N_SESSIONS = 100;
const N_BREAKTHROUGHS = 25;
const N_SHIFTS = 130;
const N_GOALS = 10;

const NAMES = [
  "Belonging Without Bargaining",
  "The Honored Edge",
  "The Sovereign",
  "True North",
  "The Quiet Yes",
  "When the Edge Held",
  "Naming What's Mine",
  "The Soft Refusal",
  "The Threshold",
  "Permission Without Asking",
  "The Careful Mirror",
  "Unburdening",
  "The Returning",
  "Steady in the Doubt",
  "The First Honest No",
  "What I Won't Carry",
  "Letting the Cost Show",
  "Coming Back to Center",
  "Owning the Ask",
  "The Listening Self",
  "Friends with the Pause",
  "When Stillness Spoke",
  "Through the Constriction",
  "The New Pattern",
  "What I'm Worth",
];

const BREAKTHROUGH_CONTENT = [
  "Recognized perfectionism as fear in costume",
  "Distinguishing harm from discomfort",
  "Permission to choose self",
  "Greater clarity in own decision-making",
  "Felt sense as a compass",
  "Listening without fixing",
  "Letting belonging cost something",
  "Honoring what doesn't fit",
  "Choosing direction before certainty",
  "Resting in the question",
  "The first honest no",
  "Coming back from spinning",
  "Acknowledging what's been carrying",
  "Trust in the after",
  "Naming the fear behind the avoidance",
  "Releasing the rescuer stance",
  "Felt my edges hold under pressure",
  "Stopped explaining, started being",
  "Realized I'm allowed to take up space",
  "Found steadiness without certainty",
  "Met my own gaze without flinching",
  "Trusted my discomfort as data",
  "Stopped translating myself",
  "Walked toward what I want",
  "Returned to my body in the conflict",
  "Stopped seeking permission to live",
  "Released the weight of others' comfort",
  "Met my anger without collapse",
  "Heard my own no as a yes to me",
  "Faced what I'd been outsourcing",
];

const SHIFT_CONTENT = [
  "Started weighting alignment over external markers",
  "Listening without fixing",
  "Identified the cost of waiting for certainty",
  "Recognized explanation as a cue to stop",
  "Felt sense as a compass",
  "Discomfort doesn't always mean wrong",
  "Performing connection vs being in it",
  "Anger as information, not aggression",
  "Slowness isn't laziness",
  "Capacity is finite and that's not a failure",
  "I can be loved and inconvenient",
  "Boundaries are how I love them, not punish them",
  "My pace is allowed",
  "Self-trust over self-monitoring",
  "What I want matters even when no one asks",
  "I don't have to optimize the present moment",
  "Curiosity instead of certainty",
  "It's safe to stop earning",
  "Tenderness toward my younger parts",
  "Resting is a discipline, not a reward",
  "Disappointment isn't a wound",
  "Conflict can be intimate",
  "I get to want what I want",
  "Reframed urgency as a learned response",
  "Stopped armoring against ordinary feelings",
  "Permission to not know",
  "Trust the slow yes",
  "Held people without saving them",
  "Receiving feels different from taking",
  "Direct doesn't have to be unkind",
  "I can name dynamics out loud",
  "Stopped attaching to others' comfort",
  "Identified people-pleasing as self-erasure",
  "Allowed for ambiguity",
  "My intuition has a track record",
  "Walked back from over-functioning",
  "Comfort isn't always alignment",
  "Surface compliance vs real consent",
  "Quiet doesn't mean settled",
  "Tracked my body's no",
  "Said the second sentence I usually swallow",
  "Realized I was performing my growth",
  "Stopped explaining myself preemptively",
  "Boundary = honesty in present tense",
  "Disagreement isn't disconnection",
  "Felt the difference between fear and reality",
  "Practiced staying when I usually leave",
  "Recognized self-doubt as someone else's voice",
  "Allowed myself to be misunderstood",
  "My body knows before my mind",
  "Stopped curating my truth for others",
  "What I notice is information",
  "Gave myself permission to be in process",
  "Anger held without spilling",
  "Recognized when I'm borrowing fear",
  "Stopped negotiating with the inner critic",
  "Sat with the feeling without solving it",
];

const GOAL_TITLES = [
  "Develop emotional intelligence",
  "Practice mindful boundaries",
  "Strengthen vocational alignment",
  "Embrace creative play",
  "Lead from values",
  "Build self-trust",
  "Cultivate steady presence",
  "Honor my body's wisdom",
  "Practice direct communication",
  "Stay in conflict without leaving",
];

// Snippet pools — for demo only. In production these would be
// LLM-generated at session-end and stored alongside each
// contributor link. Each (parent, contributor) pair gets a
// deterministic snippet pulled from one of these pools so the
// expanded detail view feels narrative without needing real
// AI generation.

const SESSION_SNIPPETS = [
  "Tracked the body's no during a recurring conversation.",
  "Surfaced the cost of staying small in this dynamic.",
  "Named the fear behind a long-standing avoidance.",
  "Returned to the body when the spinning started.",
  "Met your anger without collapsing into apology.",
  "Distinguished real harm from ordinary discomfort.",
  "Allowed disagreement without disconnecting.",
  "Honored what doesn't fit anymore.",
  "Noticed the rescuer urge and stayed in your seat.",
  "Felt the pull to over-explain and chose silence.",
  "Spoke the no you'd been swallowing.",
  "Recognized the inner critic as a borrowed voice.",
  "Practiced direct communication with someone difficult.",
  "Met your discomfort as data, not a problem.",
  "Sat with a feeling without solving it.",
  "Trusted your slow yes.",
  "Identified people-pleasing as self-erasure in this case.",
  "Held people without saving them.",
  "Released a quiet permission you'd been seeking.",
  "Practiced staying when you usually leave.",
  "Caught the preemptive apology before it landed.",
  "Walked back from over-functioning mid-conversation.",
  "Let yourself be misunderstood without rushing to clarify.",
  "Noticed the moment your body went still.",
  "Said the second sentence you usually swallow.",
];

const SHIFT_SNIPPETS = [
  "Cleared space for a new way of meeting yourself.",
  "Made room for direction without certainty.",
  "Loosened the grip of perfectionist striving.",
  "Reframed an old reflex as a learned response.",
  "Untethered comfort from alignment.",
  "Helped you stop performing connection.",
  "Made disagreement feel survivable.",
  "Showed your slowness as a kind of intelligence.",
  "Gave permission to be in process rather than arrived.",
  "Quieted the inner monitor for the first time.",
  "Unlocked direct communication where you'd been hedging.",
  "Made boundaries feel like care instead of punishment.",
];

const BREAKTHROUGH_SNIPPETS = [
  "Crystallized a long-held question into action.",
  "Anchored a new pattern in the body, not just the mind.",
  "Made the abstract concrete for the first time.",
  "Marked the threshold between old and new identity.",
  "Carried forward into how you show up now.",
  "Set the foundation everything since has built on.",
];

const NOTICED_SNIPPETS = [
  "Your language changed from 'should' to 'choose.'",
  "You held disagreement without scrambling to fix it.",
  "Anger arrived as information rather than threat.",
  "Your body relaxed before your mind agreed.",
  "You stopped translating yourself mid-sentence.",
  "Slowness landed as enough.",
  "You named a pattern instead of repeating it.",
  "A new word for an old pattern.",
  "You stopped seeking permission mid-conversation.",
  "The reflexive 'sorry' fell out of your speech.",
  "You sat with the discomfort without explaining it away.",
  "Your direction-of-attention shifted before you noticed.",
];

// Deterministic snippet picker — same (parent, contributor, pool)
// always returns the same snippet across renders.
export function snippetFor(
  parentId: string,
  contributorId: string,
  kind: "session" | "shift" | "breakthrough" | "noticed",
): string {
  const pool =
    kind === "session"
      ? SESSION_SNIPPETS
      : kind === "shift"
        ? SHIFT_SNIPPETS
        : kind === "breakthrough"
          ? BREAKTHROUGH_SNIPPETS
          : NOTICED_SNIPPETS;
  return pickIdx(pool, `${kind}_${parentId}_${contributorId}`);
}

// Deterministic pick from an array using a hash key — stable across
// renders so the demo dataset never shuffles.
function pickIdx<T>(arr: T[], key: string, salt = 0): T {
  return arr[Math.floor(hashFloat(key, salt) * arr.length)];
}

// Pick N distinct items deterministically. Implemented by hashing
// each item's index + key prefix, sorting by hash, and taking the
// first N.
function pickN<T>(arr: T[], n: number, keyPrefix: string): T[] {
  if (arr.length === 0) return [];
  const indexed = arr.map((item, i) => ({
    item,
    key: hashFloat(`${keyPrefix}_${i}`),
  }));
  indexed.sort((a, b) => a.key - b.key);
  return indexed.slice(0, Math.min(n, indexed.length)).map((p) => p.item);
}

type LegacyTextRow = {
  id: string;
  content: string;
  created_at: string;
};

export function buildDemoData(): {
  sessions: SessionDot[];
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
  constellationLinks: Map<string, ConstellationLinks>;
  mindsetShiftLinks: Map<string, MindsetShiftLinks>;
  goalLinks: Map<string, GoalLinks>;
  legacySections: {
    breakthroughs: LegacyTextRow[];
    insights: LegacyTextRow[];
  };
} {
  // Sessions spread across TOTAL_DAYS with light per-item jitter.
  // Linear distribution so the constellation has stars at every age
  // band — useful for testing the time-window pills.
  const sessions: SessionDot[] = [];
  for (let i = 0; i < N_SESSIONS; i++) {
    const linearDays = (i / (N_SESSIONS - 1)) * TOTAL_DAYS;
    const jitter = (hashFloat(`s${i}`, 1) - 0.5) * 4; // ±2 days
    const days = Math.max(0, linearDays + jitter);
    sessions.push({ id: `demo-s${i}`, endedAt: daysAgoIso(days) });
  }

  // Mindset shifts — each tied to a deterministic session.
  const mindsetShifts: MindsetShiftDot[] = [];
  for (let i = 0; i < N_SHIFTS; i++) {
    const sessIdx = Math.floor(hashFloat(`m${i}`, 2) * N_SESSIONS);
    const session = sessions[sessIdx];
    mindsetShifts.push({
      id: `demo-m${i}`,
      sessionId: session.id,
      content: pickIdx(SHIFT_CONTENT, `mc${i}`),
      createdAt: session.endedAt,
    });
  }

  // Breakthroughs — rarer (every ~4 sessions on average), spread
  // across the time range.
  const breakthroughs: BreakthroughDot[] = [];
  for (let i = 0; i < N_BREAKTHROUGHS; i++) {
    const baseIdx = Math.floor((i / N_BREAKTHROUGHS) * N_SESSIONS);
    const drift = Math.floor(hashFloat(`b${i}`, 3) * 3);
    const sessIdx = Math.min(baseIdx + drift, N_SESSIONS - 1);
    const session = sessions[sessIdx];
    breakthroughs.push({
      id: `demo-b${i}`,
      sessionId: session.id,
      content: pickIdx(BREAKTHROUGH_CONTENT, `bc${i}`),
      createdAt: session.endedAt,
    });
  }

  // Goals — varied lastEngagedAt across the full time range,
  // including some never engaged. Two goals get null lastEngagedAt.
  const goals: GoalDot[] = [];
  for (let i = 0; i < N_GOALS; i++) {
    const isNeverEngaged = i >= 8;
    const lastEngagedDays = isNeverEngaged
      ? null
      : hashFloat(`g${i}`, 5) * TOTAL_DAYS;
    goals.push({
      id: `demo-g${i}`,
      title: pickIdx(GOAL_TITLES, `gt${i}`),
      lastEngagedAt:
        lastEngagedDays === null ? null : daysAgoIso(lastEngagedDays),
    });
  }

  // Constellation links per breakthrough — sessions + mindset shifts
  // that led to it. Goals are NOT contributors (goals are caused by
  // breakthroughs in the influence model, not the other way).
  // Contributors must pre-date the breakthrough.
  const constellationLinks = new Map<string, ConstellationLinks>();
  for (const b of breakthroughs) {
    const bTime = Date.parse(b.createdAt);
    const eligibleSessions = sessions.filter(
      (s) => Date.parse(s.endedAt) <= bTime && s.id !== b.sessionId,
    );
    const eligibleShifts = mindsetShifts.filter(
      (m) => Date.parse(m.createdAt) <= bTime,
    );
    const numSessions = 2 + Math.floor(hashFloat(`bls${b.id}`) * 3);
    const numShifts = 2 + Math.floor(hashFloat(`blm${b.id}`) * 4);
    constellationLinks.set(b.id, {
      name: pickIdx(NAMES, `bn${b.id}`),
      sessionIds: pickN(eligibleSessions, numSessions, b.id + "_s").map(
        (s) => s.id,
      ),
      shiftIds: pickN(eligibleShifts, numShifts, b.id + "_m").map((m) => m.id),
    });
  }

  // Per-shift contributors: 1-3 prior sessions that led to the shift.
  const mindsetShiftLinks = new Map<string, MindsetShiftLinks>();
  for (const m of mindsetShifts) {
    const mTime = Date.parse(m.createdAt);
    const eligibleSessions = sessions.filter(
      (s) => Date.parse(s.endedAt) <= mTime && s.id !== m.sessionId,
    );
    const numSessions = 1 + Math.floor(hashFloat(`mls${m.id}`) * 3);
    mindsetShiftLinks.set(m.id, {
      sessionIds: pickN(eligibleSessions, numSessions, m.id + "_s").map(
        (s) => s.id,
      ),
    });
  }

  // Per-goal contributors: sessions worked, shifts that progressed
  // it, and breakthroughs that landed in its theme. Pulls from items
  // pre-dating the goal's lastEngagedAt — so a goal with no
  // engagement gets no contributors (lines aren't drawable anyway).
  const goalLinks = new Map<string, GoalLinks>();
  for (const g of goals) {
    if (!g.lastEngagedAt) {
      goalLinks.set(g.id, {
        sessionIds: [],
        shiftIds: [],
        breakthroughIds: [],
      });
      continue;
    }
    const gTime = Date.parse(g.lastEngagedAt);
    const eligibleSessions = sessions.filter(
      (s) => Date.parse(s.endedAt) <= gTime,
    );
    const eligibleShifts = mindsetShifts.filter(
      (m) => Date.parse(m.createdAt) <= gTime,
    );
    const eligibleBreakthroughs = breakthroughs.filter(
      (b) => Date.parse(b.createdAt) <= gTime,
    );
    const numSessions = 2 + Math.floor(hashFloat(`gls${g.id}`) * 4);
    const numShifts = 1 + Math.floor(hashFloat(`glm${g.id}`) * 3);
    const numBreakthroughs = Math.floor(hashFloat(`glb${g.id}`) * 2);
    goalLinks.set(g.id, {
      sessionIds: pickN(eligibleSessions, numSessions, g.id + "_s").map(
        (s) => s.id,
      ),
      shiftIds: pickN(eligibleShifts, numShifts, g.id + "_m").map((m) => m.id),
      breakthroughIds: pickN(
        eligibleBreakthroughs,
        numBreakthroughs,
        g.id + "_b",
      ).map((b) => b.id),
    });
  }

  // Legacy sections — most-recent 50 of each, sorted newest first.
  const legacyBreakthroughs: LegacyTextRow[] = [...breakthroughs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 50)
    .map((b) => ({
      id: b.id,
      content: b.content,
      created_at: b.createdAt,
    }));
  const legacyInsights: LegacyTextRow[] = [...mindsetShifts]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 50)
    .map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.createdAt,
    }));

  return {
    sessions,
    breakthroughs,
    mindsetShifts,
    goals,
    constellationLinks,
    mindsetShiftLinks,
    goalLinks,
    legacySections: {
      breakthroughs: legacyBreakthroughs,
      insights: legacyInsights,
    },
  };
}

// ---------------------------------------------------------------
// Cross-tab demo data exports for /home, /goals, /sessions demo
// branches. Derived from the same generated dataset so navigating
// across tabs in demo mode shows coherent content.

const _DEMO = buildDemoData();

export const DEMO_LEGACY_SECTIONS = _DEMO.legacySections;

// /sessions list — most-recent 50 sessions with synthetic summary
// text (deterministic via hash). Real sessions have richer content;
// for demo this is enough to fill the list and exercise scrolling.
const SESSION_SUMMARIES = [
  "Worked through a familiar pattern with new awareness.",
  "Surfaced what's been weighing and what would feel different.",
  "Practiced staying with the discomfort instead of fixing it.",
  "Identified a cost I'd been quietly paying.",
  "Named the fear behind the avoidance.",
  "Acknowledged the part of me that's been carrying this.",
  "Distinguished real harm from ordinary discomfort.",
  "Came back to my body in the middle of the spin.",
  "Met my anger without collapsing.",
  "Honored what doesn't fit anymore.",
  "Said the no I'd been swallowing.",
  "Released the obligation to be readable.",
  "Trusted my discomfort as information.",
  "Walked toward what I actually want.",
  "Allowed for ambiguity.",
];
const PROGRESS_SHORTS = [
  "Felt sense becoming a more reliable guide.",
  "Less negotiating with the inner critic.",
  "Permission to be in process.",
  "Honored direction without certainty.",
  "Boundaries with warmth.",
  "Disagreement without disconnection.",
];
export const DEMO_SESSIONS_LIST = [..._DEMO.sessions]
  .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
  .slice(0, 50)
  .map((s) => ({
    id: s.id,
    started_at: s.endedAt, // use ended_at as a proxy in demo
    ended_at: s.endedAt,
    summary: pickIdx(SESSION_SUMMARIES, `summ${s.id}`),
    progress_summary_short: pickIdx(PROGRESS_SHORTS, `prog${s.id}`),
  }));

// /goals — render the same goal pool with completion-type metadata
// the demo /goals page expects.
const GOAL_DESCRIPTIONS = [
  "Notice signals before they become reactions.",
  "Hold them with warmth, not defense.",
  "Move toward what feels in fit; let go of what doesn't.",
  "Make something with no goal beyond making it.",
  "Choose the harder kindness when it matters.",
  "Trust my own knowing.",
  "Stay in the room when it's hard.",
  "Listen to the body's quieter signals.",
  "Speak the second sentence I usually swallow.",
  "Stay until the resolution, not just the lull.",
];
export const DEMO_GOALS = _DEMO.goals.map((g, i) => ({
  id: g.id,
  title: g.title,
  description: pickIdx(GOAL_DESCRIPTIONS, `gd${g.id}`),
  completionType:
    i === 0 ? ("milestone" as const) : ("practice" as const),
  lastEngagedAt: g.lastEngagedAt,
  progressPercent: i === 0 ? 78 : (null as number | null),
}));

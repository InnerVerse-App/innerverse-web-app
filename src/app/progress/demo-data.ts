// Demo-mode mock data for the Progress-tab constellation. Triggered
// by the `?demo=1` query param on /progress. Lets the operator
// visually preview the constellation without seeding real DB rows.
//
// Dates are computed relative to "now" so the constellation always
// looks current regardless of when this file was written. The
// returned data shape matches what the real DB readers produce.

import type {
  BreakthroughDot,
  GoalDot,
  MindsetShiftDot,
  SessionDot,
} from "./constellation-layout";

const DAY_MS = 86_400_000;

function daysAgoIso(days: number, hours = 10): string {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setUTCHours(hours, 0, 0, 0);
  return d.toISOString();
}

export function buildDemoData(): {
  sessions: SessionDot[];
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
} {
  // 6 sessions spanning the last 21 days (within the recency-window).
  const sessions: SessionDot[] = [
    { id: "demo-s1", endedAt: daysAgoIso(21) },
    { id: "demo-s2", endedAt: daysAgoIso(14) },
    { id: "demo-s3", endedAt: daysAgoIso(9) },
    { id: "demo-s4", endedAt: daysAgoIso(5) },
    { id: "demo-s5", endedAt: daysAgoIso(2) },
    { id: "demo-s6", endedAt: daysAgoIso(0, 9) },
  ];

  // 4 breakthroughs across 3 different sessions (one session has two).
  const breakthroughs: BreakthroughDot[] = [
    {
      id: "demo-b1",
      sessionId: "demo-s2",
      content: "Named the fear behind negative feedback",
      createdAt: daysAgoIso(14),
    },
    {
      id: "demo-b2",
      sessionId: "demo-s4",
      content: "Distinguishing harm from discomfort",
      createdAt: daysAgoIso(5),
    },
    {
      id: "demo-b3",
      sessionId: "demo-s4",
      content: "Permission to choose self",
      createdAt: daysAgoIso(5),
    },
    {
      id: "demo-b4",
      sessionId: "demo-s6",
      content: "Greater clarity in own decision-making",
      createdAt: daysAgoIso(0, 9),
    },
  ];

  // 5 mindset shifts across 4 sessions, including one in a session
  // with no breakthrough (so it orbits the session itself).
  const mindsetShifts: MindsetShiftDot[] = [
    {
      id: "demo-m1",
      sessionId: "demo-s1",
      content: "Started weighting alignment over external markers",
      createdAt: daysAgoIso(21),
    },
    {
      id: "demo-m2",
      sessionId: "demo-s2",
      content: "Listening without fixing",
      createdAt: daysAgoIso(14),
    },
    {
      id: "demo-m3",
      sessionId: "demo-s3",
      content: "Identified the cost of waiting for certainty",
      createdAt: daysAgoIso(9),
    },
    {
      id: "demo-m4",
      sessionId: "demo-s4",
      content: "Recognized explanation as a cue to stop",
      createdAt: daysAgoIso(5),
    },
    {
      id: "demo-m5",
      sessionId: "demo-s6",
      content: "Felt sense as a compass",
      createdAt: daysAgoIso(0, 9),
    },
  ];

  // 5 active goals showing the full recency spectrum:
  //   - 2 recently engaged (bright, on the right)
  //   - 1 mid-engaged (moderate fade)
  //   - 1 stale (engaged once long ago, faded floor on left)
  //   - 1 never engaged (faded floor on left)
  const goals: GoalDot[] = [
    {
      id: "demo-g1",
      title: "Develop emotional intelligence",
      lastEngagedAt: daysAgoIso(0, 9),
    },
    {
      id: "demo-g2",
      title: "Practice mindful boundaries",
      lastEngagedAt: daysAgoIso(5),
    },
    {
      id: "demo-g3",
      title: "Strengthen vocational alignment",
      lastEngagedAt: daysAgoIso(14),
    },
    {
      id: "demo-g4",
      title: "Embrace creative play",
      lastEngagedAt: daysAgoIso(45),
    },
    {
      id: "demo-g5",
      title: "Lead from values",
      lastEngagedAt: null,
    },
  ];

  return { sessions, breakthroughs, mindsetShifts, goals };
}

export const DEMO_LEGACY_SECTIONS = {
  breakthroughs: [
    {
      id: "demo-b4",
      content: "Greater clarity in own decision-making",
      created_at: daysAgoIso(0, 9),
    },
    {
      id: "demo-b3",
      content: "Permission to choose self",
      created_at: daysAgoIso(5),
    },
    {
      id: "demo-b2",
      content: "Distinguishing harm from discomfort",
      created_at: daysAgoIso(5),
    },
    {
      id: "demo-b1",
      content: "Named the fear behind negative feedback",
      created_at: daysAgoIso(14),
    },
  ],
  insights: [
    {
      id: "demo-m5",
      content: "Felt sense as a compass",
      created_at: daysAgoIso(0, 9),
    },
    {
      id: "demo-m4",
      content: "Recognized explanation as a cue to stop",
      created_at: daysAgoIso(5),
    },
    {
      id: "demo-m3",
      content: "Identified the cost of waiting for certainty",
      created_at: daysAgoIso(9),
    },
    {
      id: "demo-m2",
      content: "Listening without fixing",
      created_at: daysAgoIso(14),
    },
    {
      id: "demo-m1",
      content: "Started weighting alignment over external markers",
      created_at: daysAgoIso(21),
    },
  ],
};

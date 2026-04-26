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

// A breakthrough's constellation — which stars led to it. Demo only;
// real data needs a schema chunk to add contributing_*_ids columns
// to the breakthroughs table and an LLM session-end tagging step.
export type ConstellationLinks = {
  sessionIds: string[];
  shiftIds: string[];
  goalIds: string[];
};

export function buildDemoData(): {
  sessions: SessionDot[];
  breakthroughs: BreakthroughDot[];
  mindsetShifts: MindsetShiftDot[];
  goals: GoalDot[];
  constellationLinks: Map<string, ConstellationLinks>;
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

  // The "constellation" for each breakthrough — the stars that led
  // to it. Demo only; real data needs a schema chunk that adds
  // contributing_*_ids columns to the breakthroughs table and an LLM
  // session-end tagging step that populates them.
  const constellationLinks = new Map<
    string,
    { sessionIds: string[]; shiftIds: string[]; goalIds: string[] }
  >([
    [
      "demo-b1",
      {
        sessionIds: ["demo-s1", "demo-s2"],
        shiftIds: ["demo-m1", "demo-m2"],
        goalIds: ["demo-g1"],
      },
    ],
    [
      "demo-b2",
      {
        sessionIds: ["demo-s2", "demo-s3", "demo-s4"],
        shiftIds: ["demo-m2", "demo-m3", "demo-m4"],
        goalIds: ["demo-g2"],
      },
    ],
    [
      "demo-b3",
      {
        sessionIds: ["demo-s3", "demo-s4"],
        shiftIds: ["demo-m3", "demo-m4"],
        goalIds: ["demo-g1", "demo-g2"],
      },
    ],
    [
      "demo-b4",
      {
        sessionIds: ["demo-s5", "demo-s6"],
        shiftIds: ["demo-m1", "demo-m3", "demo-m5"],
        goalIds: ["demo-g3"],
      },
    ],
  ]);

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

  return { sessions, breakthroughs, mindsetShifts, goals, constellationLinks };
}

// Mock data shared with the demo escape hatches on /home, /goals,
// and /sessions so navigating between tabs in demo mode looks
// coherent. DROP BEFORE MERGE.

export const DEMO_SESSIONS_LIST = [
  {
    id: "demo-s6",
    started_at: daysAgoIso(0, 8),
    ended_at: daysAgoIso(0, 9),
    summary:
      "We unpacked a creeping fear that your direction was just paper success. You named the felt difference between alignment and certainty and committed to weighting the sense of fit alongside external markers.",
    progress_summary_short:
      "Greater clarity in own decision-making — values direction over external markers.",
  },
  {
    id: "demo-s5",
    started_at: daysAgoIso(2, 9),
    ended_at: daysAgoIso(2, 10),
    summary:
      "Continued the values-direction thread. Identified two specific upcoming decisions where the felt-fit framing applies and chose one to act on this week.",
    progress_summary_short:
      "Applied felt-fit framing to two real decisions; committed to acting on one.",
  },
  {
    id: "demo-s4",
    started_at: daysAgoIso(5, 8),
    ended_at: daysAgoIso(5, 9),
    summary:
      "Two breakthroughs this session: distinguishing harm from discomfort, and giving yourself permission to choose self. Worked through the boundary you wanted to keep during the testing push.",
    progress_summary_short:
      "Distinguishing harm from discomfort + permission to choose self.",
  },
  {
    id: "demo-s3",
    started_at: daysAgoIso(9, 9),
    ended_at: daysAgoIso(9, 10),
    summary:
      "Identified the hidden cost of waiting for certainty before acting on values-aligned decisions.",
    progress_summary_short:
      "Surfaced the cost of waiting for certainty.",
  },
  {
    id: "demo-s2",
    started_at: daysAgoIso(14, 8),
    ended_at: daysAgoIso(14, 9),
    summary:
      "Named the fear behind negative feedback (loss of belonging) and held a balanced interpretation. Moved toward listening without fixing.",
    progress_summary_short:
      "Named the fear behind negative feedback; listening without fixing.",
  },
  {
    id: "demo-s1",
    started_at: daysAgoIso(21, 8),
    ended_at: daysAgoIso(21, 9),
    summary:
      "First session. Surfaced what's been weighing on you and what would feel different — established the initial direction.",
    progress_summary_short: "Setting initial direction.",
  },
];

export const DEMO_GOALS = [
  {
    id: "demo-g1",
    title: "Develop emotional intelligence",
    description: "Notice signals before they become reactions.",
    completionType: "practice" as const,
    lastEngagedAt: daysAgoIso(0, 9),
    progressPercent: null as number | null,
  },
  {
    id: "demo-g2",
    title: "Practice mindful boundaries",
    description: "Hold them with warmth, not defense.",
    completionType: "practice" as const,
    lastEngagedAt: daysAgoIso(5),
    progressPercent: null,
  },
  {
    id: "demo-g3",
    title: "Strengthen vocational alignment",
    description: "Move toward what feels in fit; let go of what doesn't.",
    completionType: "practice" as const,
    lastEngagedAt: daysAgoIso(14),
    progressPercent: null,
  },
  {
    id: "demo-g6",
    title: "Finish the InnerVerse app",
    description: "Ship the v1 build to testers.",
    completionType: "milestone" as const,
    lastEngagedAt: daysAgoIso(0, 9),
    progressPercent: 78,
  },
  {
    id: "demo-g4",
    title: "Embrace creative play",
    description: "Make something with no goal beyond making it.",
    completionType: "practice" as const,
    lastEngagedAt: daysAgoIso(45),
    progressPercent: null,
  },
  {
    id: "demo-g5",
    title: "Lead from values",
    description: "Choose the harder kindness when it matters.",
    completionType: "practice" as const,
    lastEngagedAt: null,
    progressPercent: null,
  },
];

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

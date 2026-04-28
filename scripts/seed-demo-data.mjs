// One-off seed for a demo account. Populates 15 sessions, 2 mindset
// shifts, 1 breakthrough, 5 goals — all metadata-only (no chat
// transcripts), tied to one user_id. Idempotent: aborts if it
// detects existing seeded data for the same user.
//
// Usage:
//   node --env-file=.env.local scripts/seed-demo-data.mjs <user_id>

import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: node --env-file=.env.local scripts/seed-demo-data.mjs <user_id>");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Marker text in seed sessions' summary so we can detect re-runs.
const SEED_MARKER = "[demo-seed-v1]";

const DAY_MS = 86_400_000;
function daysAgo(d, hour = 14) {
  const t = new Date(Date.now() - d * DAY_MS);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
}

// 5 NEW goals (added on top of the user's existing onboarding goals).
const GOALS = [
  {
    title: "Improve communication",
    description: "Speak up earlier in conversations instead of swallowing the harder thought.",
    is_predefined: true,
    status: "on_track",
    progress_percent: 45,
    progress_rationale: "Two sessions in a row you named the harder thing in the moment instead of after.",
  },
  {
    title: "Practice mindfulness",
    description: "Notice body signals before they become decisions.",
    is_predefined: true,
    status: "on_track",
    progress_percent: 30,
    progress_rationale: "You've started catching the chest-tightness cue 2-3 times a week.",
  },
  {
    title: "Reduce stress & anxiety",
    description: "Less spiraling, more responding.",
    is_predefined: true,
    status: "on_track",
    progress_percent: 55,
    progress_rationale: "Stress drops faster after sessions; the loop is shorter than it was a month ago.",
  },
  {
    title: "Set healthy boundaries",
    description: "Stop saying yes when the body is saying no.",
    is_predefined: true,
    status: "on_track",
    progress_percent: 60,
    progress_rationale: "First honest no last week — landed without collapsing or over-explaining.",
  },
  {
    title: "Find what's holding you back",
    description: "Identify the recurring fear that keeps showing up under different costumes.",
    is_predefined: true,
    status: "on_track",
    progress_percent: 70,
    progress_rationale: "You've named it twice now — fear of being seen failing in front of people who matter.",
  },
];

// Theme vocabulary that the AI would have built up over 15 sessions.
const THEMES = [
  { label: "The polish trap", description: "Mistaking finishing-and-shipping for finishing-and-being-good-enough." },
  { label: "Validation gap", description: "Waiting on outside reassurance before letting yourself act." },
  { label: "Boundaries with work", description: "When work hours bleed into rest hours." },
  { label: "Speaking up", description: "Naming the harder thing in the moment instead of after." },
  { label: "Body signals", description: "What the body knows before the head can name it." },
  { label: "The pause", description: "Choosing a beat before the automatic response." },
  { label: "What's mine to carry", description: "Sorting your responsibilities from someone else's." },
  { label: "Permission to rest", description: "Resting without earning it first." },
];

// 15 session titles + summaries, dated over ~90 days. Most-recent first.
// Each session references which themes it touched, which goal it links to,
// and is set up so we can wire 2 shifts + 1 breakthrough across them.
const SESSIONS = [
  {
    days: 2,
    title: "First honest no — and it landed",
    summary: "You said no to the project request without softening it into a maybe. The boundary held. We named the muscle that's growing — saying no without the cost of explanation.",
    progress_pct: 72,
    themes: [
      { label: "Speaking up", direction: "forward", intensity: 4, evidence: "I said no without explaining." },
      { label: "Body signals", direction: "forward", intensity: 3, evidence: "I felt the tightness loosen as I said it." },
    ],
    goal_link: "Set healthy boundaries",
  },
  {
    days: 6,
    title: "Naming the fear under the perfectionism",
    summary: "We worked under the polish — what you're really afraid of is being seen as not-good-enough by people you respect. You stopped calling it perfectionism and called it fear of judgment.",
    progress_pct: 68,
    themes: [
      { label: "The polish trap", direction: "forward", intensity: 5, evidence: "It's not about quality, it's about being seen failing." },
      { label: "Validation gap", direction: "stuck", intensity: 4, evidence: "I'm still waiting for someone to say it's okay." },
    ],
    goal_link: "Find what's holding you back",
  },
  {
    days: 10,
    title: "When the body knew first",
    summary: "You caught the chest-tightness BEFORE saying yes. We sat with it. The body signal was the new data — and you trusted it enough to wait, then say no.",
    progress_pct: 65,
    themes: [
      { label: "Body signals", direction: "forward", intensity: 5, evidence: "My chest got tight before I even spoke." },
      { label: "The pause", direction: "forward", intensity: 4, evidence: "I waited a beat and the answer changed." },
    ],
    goal_link: "Practice mindfulness",
  },
  {
    days: 14,
    title: "The cost of the unsaid",
    summary: "We mapped what it costs you to swallow the harder thought. You named the resentment that builds up. The exchange isn't free — quiet now, distance later.",
    progress_pct: 58,
    themes: [
      { label: "Speaking up", direction: "forward", intensity: 4, evidence: "Every time I don't say it, I take a step back." },
    ],
    goal_link: "Improve communication",
  },
  {
    days: 18,
    title: "Resting without earning it",
    summary: "You took a Saturday off without a justification list. We worked the discomfort of unjustified rest. By the end you were laughing at how hard it was to just stop.",
    progress_pct: 50,
    themes: [
      { label: "Permission to rest", direction: "forward", intensity: 4, evidence: "I felt guilty for sitting still." },
      { label: "Boundaries with work", direction: "forward", intensity: 3, evidence: "I closed the laptop at 6 and didn't reopen it." },
    ],
    goal_link: "Reduce stress & anxiety",
  },
  {
    days: 24,
    title: "Saying yes to learn, not to please",
    summary: "We separated yes-as-curiosity from yes-as-appeasement. You picked one upcoming yes and tested whether it was the real kind.",
    progress_pct: 47,
    themes: [
      { label: "What's mine to carry", direction: "forward", intensity: 4, evidence: "Half of these aren't even mine." },
    ],
    goal_link: "Set healthy boundaries",
  },
  {
    days: 31,
    title: "The validation experiment",
    summary: "Instead of waiting for someone to say the work is good, you ran a small experiment to find out. The result mattered less than the shift — you're now the arbiter, not them.",
    progress_pct: 42,
    themes: [
      { label: "Validation gap", direction: "forward", intensity: 5, evidence: "I went looking for the answer instead of waiting." },
      { label: "The polish trap", direction: "forward", intensity: 3, evidence: "Good enough to test is enough." },
    ],
    goal_link: "Find what's holding you back",
  },
  {
    days: 38,
    title: "When the pause spoke louder than the words",
    summary: "We worked the pause — the beat between trigger and response. You started using it intentionally. Half the conversations it changed the answer.",
    progress_pct: 40,
    themes: [
      { label: "The pause", direction: "forward", intensity: 5, evidence: "I waited and the room changed." },
      { label: "Body signals", direction: "forward", intensity: 3, evidence: "I noticed my shoulders before I noticed I was angry." },
    ],
    goal_link: "Practice mindfulness",
  },
  {
    days: 45,
    title: "Sorting whose problem is whose",
    summary: "You mapped a recent conflict and we found three pieces that weren't yours to fix. You handed two back. The third you kept — and that one was yours.",
    progress_pct: 35,
    themes: [
      { label: "What's mine to carry", direction: "forward", intensity: 5, evidence: "I'd been carrying his anxiety as if it were a fact." },
    ],
    goal_link: "Improve communication",
  },
  {
    days: 53,
    title: "Hours that aren't work hours",
    summary: "We built the boundary line and you tested it. By the end of the week you'd held the line three nights out of five. The two you missed had a pattern — both were tired-Steven defaults.",
    progress_pct: 32,
    themes: [
      { label: "Boundaries with work", direction: "forward", intensity: 4, evidence: "I shut the laptop and went outside." },
    ],
    goal_link: "Reduce stress & anxiety",
  },
  {
    days: 60,
    title: "What perfectionism is actually defending against",
    summary: "We went under the surface of polish. The thing being protected isn't the work — it's the version of you that gets to keep its self-image intact. Naming that loosened it.",
    progress_pct: 28,
    themes: [
      { label: "The polish trap", direction: "forward", intensity: 5, evidence: "If it's not perfect, what does that say about me." },
    ],
    goal_link: "Find what's holding you back",
  },
  {
    days: 67,
    title: "The first time you noticed without judging",
    summary: "You caught yourself spiraling and didn't immediately try to fix it. You watched it. By the end of the watching, the spiral had cooled on its own.",
    progress_pct: 25,
    themes: [
      { label: "Body signals", direction: "forward", intensity: 4, evidence: "I just sat with the wave instead of fighting it." },
      { label: "The pause", direction: "forward", intensity: 3, evidence: "Five seconds of noticing changed the whole thing." },
    ],
    goal_link: "Practice mindfulness",
  },
  {
    days: 75,
    title: "Speaking before the regret",
    summary: "You named the thing in the meeting instead of carrying it home. The cost of saying it was less than you predicted. The cost of not saying it was the part you usually pay later.",
    progress_pct: 22,
    themes: [
      { label: "Speaking up", direction: "forward", intensity: 4, evidence: "I said it before I could talk myself out of it." },
    ],
    goal_link: "Improve communication",
  },
  {
    days: 82,
    title: "The shape of the recurring no",
    summary: "We traced the pattern across three different relationships. The same boundary kept getting tested. You named what was making it hard to hold — the fear of being the difficult one.",
    progress_pct: 18,
    themes: [
      { label: "What's mine to carry", direction: "stuck", intensity: 4, evidence: "I'd rather carry it than be seen as difficult." },
      { label: "Validation gap", direction: "stuck", intensity: 4, evidence: "I want them to be okay with my no first." },
    ],
    goal_link: "Set healthy boundaries",
  },
  {
    days: 90,
    title: "What you're tired of pretending isn't a problem",
    summary: "First session in this stretch. You named three things you've been calling fine that are not, in fact, fine. We didn't try to fix any of them. We just stopped pretending.",
    progress_pct: 12,
    themes: [
      { label: "Permission to rest", direction: "forward", intensity: 3, evidence: "I'm exhausted and I keep saying I'm not." },
      { label: "Boundaries with work", direction: "stuck", intensity: 4, evidence: "I keep working past when my body said stop." },
    ],
    goal_link: "Reduce stress & anxiety",
  },
];

// 2 mindset shifts. Each emerges from a specific source session and
// builds on contributing prior sessions.
// Index references into SESSIONS array (0 = most recent).
const MINDSET_SHIFTS = [
  {
    days: 6,
    sourceSessionIdx: 1, // "Naming the fear under the perfectionism"
    content: "Validation comes from running the experiment, not perfecting it before showing it.",
    evidence: "Good enough to test is enough.",
    contributingIdx: [6, 10, 1], // validation experiment, perfectionism defense, this session
    combined_score: 8,
  },
  {
    days: 10,
    sourceSessionIdx: 2, // "When the body knew first"
    content: "The body's no is information, not weakness.",
    evidence: "My chest got tight before I even spoke.",
    contributingIdx: [11, 7, 2], // noticed without judging, the pause, this session
    combined_score: 7,
  },
];

// 1 breakthrough. Built from sessions and shifts.
const BREAKTHROUGHS = [
  {
    days: 2,
    sourceSessionIdx: 0, // "First honest no"
    galaxy_name: "The First Honest No",
    content: "I can disappoint someone without it meaning I've failed them.",
    note: "First time you said no without softening, explaining, or paying for it later. The boundary held.",
    evidence: "I said no without explaining.",
    directIdx: [0], // direct sessions (the source)
    contributingShiftIdx: [1], // body's-no shift
    contributingIdx: [0, 5, 13, 1], // first no, saying yes to learn, recurring no shape, naming fear
    combined_score: 9,
  },
];

async function ensureNoExistingSeed() {
  const { data, error } = await sb
    .from("sessions")
    .select("id, summary")
    .eq("user_id", userId);
  if (error) throw error;
  const existing = (data ?? []).find((s) => s.summary?.includes(SEED_MARKER));
  if (existing) {
    throw new Error(`Seed marker found on session ${existing.id} — aborting to avoid duplicate seed. Manually delete seeded rows first.`);
  }
}

async function insertGoals() {
  const rows = GOALS.map((g) => ({
    user_id: userId,
    title: g.title,
    description: g.description,
    status: g.status,
    progress_percent: g.progress_percent,
    progress_rationale: g.progress_rationale,
    is_predefined: g.is_predefined,
  }));
  const { data, error } = await sb.from("goals").insert(rows).select("id, title");
  if (error) throw error;
  console.log(`  inserted ${data.length} goals`);
  return new Map(data.map((g) => [g.title, g.id]));
}

async function insertThemes() {
  const rows = THEMES.map((t, i) => ({
    user_id: userId,
    label: t.label,
    description: t.description,
    first_seen_at: daysAgo(90 - i * 3, 12),
    last_used_at: daysAgo(2 + Math.floor(i / 2), 14),
  }));
  const { data, error } = await sb.from("themes").insert(rows).select("id, label");
  if (error) throw error;
  console.log(`  inserted ${data.length} themes`);
  return new Map(data.map((t) => [t.label, t.id]));
}

async function insertSessions(goalMap, themeMap) {
  const rows = SESSIONS.map((s, idx) => {
    const start = daysAgo(s.days, 14);
    const end = new Date(Date.parse(start) + 35 * 60 * 1000).toISOString(); // 35min sessions
    return {
      user_id: userId,
      started_at: start,
      ended_at: end,
      is_substantive: true,
      summary: `${SEED_MARKER} ${s.summary}`,
      progress_summary_short: s.title,
      progress_percent: s.progress_pct,
      coach_message: "You're doing the real work. Keep going.",
      coach_narrative: s.summary,
      self_disclosure_score: 7 + (idx % 3),
      cognitive_shift_score: 6 + (idx % 4),
      emotional_integration_score: 6 + (idx % 3),
      novelty_score: 5 + (idx % 4),
      score_rationales: {
        self_disclosure: "Steady disclosure on a hard topic.",
        cognitive_shift: "Reframed the situation in real time.",
        emotional_integration: "Sat with the feeling instead of solving it.",
        novelty: "Introduced new language for an old pattern.",
      },
    };
  });
  const { data, error } = await sb.from("sessions").insert(rows).select("id");
  if (error) throw error;
  console.log(`  inserted ${data.length} sessions`);
  const sessionIdsByIdx = data.map((s) => s.id);

  // session_themes for each session
  const stRows = [];
  for (let i = 0; i < SESSIONS.length; i++) {
    const sess = SESSIONS[i];
    for (const t of sess.themes) {
      const themeId = themeMap.get(t.label);
      if (!themeId) throw new Error(`unknown theme label: ${t.label}`);
      stRows.push({
        session_id: sessionIdsByIdx[i],
        theme_id: themeId,
        user_id: userId,
        intensity: t.intensity,
        direction: t.direction,
        evidence_quote: t.evidence,
        score_rationale: `${t.intensity}/5: ${t.evidence}`,
        linked_goal_id: goalMap.get(sess.goal_link) ?? null,
      });
    }
  }
  const stRes = await sb.from("session_themes").insert(stRows);
  if (stRes.error) throw stRes.error;
  console.log(`  inserted ${stRows.length} session_themes`);

  return sessionIdsByIdx;
}

async function insertShifts(sessionIdsByIdx) {
  const rows = MINDSET_SHIFTS.map((m) => ({
    user_id: userId,
    session_id: sessionIdsByIdx[m.sourceSessionIdx],
    content: m.content,
    created_at: daysAgo(m.days, 14),
    contributing_session_ids: m.contributingIdx.map((i) => sessionIdsByIdx[i]),
    evidence_quote: m.evidence,
    influence_scores: {},
    combined_score: m.combined_score,
  }));
  const { data, error } = await sb.from("insights").insert(rows).select("id, content");
  if (error) throw error;
  console.log(`  inserted ${data.length} mindset shifts`);
  return data.map((i) => i.id);
}

async function insertBreakthroughs(sessionIdsByIdx, shiftIds) {
  const rows = BREAKTHROUGHS.map((b) => ({
    user_id: userId,
    session_id: sessionIdsByIdx[b.sourceSessionIdx],
    content: b.content,
    note: b.note,
    galaxy_name: b.galaxy_name,
    created_at: daysAgo(b.days, 14),
    direct_session_ids: b.directIdx.map((i) => sessionIdsByIdx[i]),
    contributing_shift_ids: b.contributingShiftIdx.map((i) => shiftIds[i]),
    contributing_session_ids: b.contributingIdx.map((i) => sessionIdsByIdx[i]),
    evidence_quote: b.evidence,
    influence_scores: {},
    combined_score: b.combined_score,
  }));
  const { data, error } = await sb.from("breakthroughs").insert(rows).select("id, content");
  if (error) throw error;
  console.log(`  inserted ${data.length} breakthroughs`);
  return data.map((b) => b.id);
}

async function backfillGoalContributors(goalMap, sessionIdsByIdx, shiftIds, breakthroughIds) {
  // Build per-goal contributor lists from the session→goal_link map.
  const byGoalSessions = new Map();
  for (let i = 0; i < SESSIONS.length; i++) {
    const goalTitle = SESSIONS[i].goal_link;
    if (!goalTitle) continue;
    const goalId = goalMap.get(goalTitle);
    if (!goalId) continue;
    if (!byGoalSessions.has(goalId)) byGoalSessions.set(goalId, []);
    byGoalSessions.get(goalId).push(sessionIdsByIdx[i]);
  }

  // Pick which shifts/breakthroughs land on which goals (subjective curation).
  // Shift 0 (validation/experiment) → "Find what's holding you back"
  // Shift 1 (body's no) → "Practice mindfulness"
  // Breakthrough 0 (first honest no) → "Set healthy boundaries"
  const byGoalShifts = new Map([
    [goalMap.get("Find what's holding you back"), [shiftIds[0]]],
    [goalMap.get("Practice mindfulness"), [shiftIds[1]]],
  ]);
  const byGoalBreakthroughs = new Map([
    [goalMap.get("Set healthy boundaries"), [breakthroughIds[0]]],
  ]);

  for (const [goalId, sessionIds] of byGoalSessions) {
    const upd = {
      contributing_session_ids: sessionIds,
      contributing_shift_ids: byGoalShifts.get(goalId) ?? [],
      contributing_breakthrough_ids: byGoalBreakthroughs.get(goalId) ?? [],
      last_session_id: sessionIds[0],
    };
    const { error } = await sb.from("goals").update(upd).eq("id", goalId);
    if (error) throw error;
  }
  console.log(`  backfilled contributors on ${byGoalSessions.size} goals`);
}

async function main() {
  console.log(`seeding demo data for user: ${userId}`);
  await ensureNoExistingSeed();

  const goalMap = await insertGoals();
  const themeMap = await insertThemes();
  const sessionIdsByIdx = await insertSessions(goalMap, themeMap);
  const shiftIds = await insertShifts(sessionIdsByIdx);
  const breakthroughIds = await insertBreakthroughs(sessionIdsByIdx, shiftIds);
  await backfillGoalContributors(goalMap, sessionIdsByIdx, shiftIds, breakthroughIds);

  console.log("DONE");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

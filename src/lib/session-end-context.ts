import "server-only";

import { COACHES } from "@/app/onboarding/data";
import { type ActiveGoal, loadActiveGoalsWithLazySeed } from "@/lib/goals";
import type { UserSupabase } from "@/lib/supabase";

// =================================================================
// Session-end context payload
// =================================================================
// Builds the structured-text developer message that goes into Call 1
// alongside prompt-session-end-v7-gpt-5.4.md and the session transcript.
// Everything the prompt names under "What you receive" (active
// goals, theme vocabulary, recent shifts/breakthroughs, coach
// persona, client first name) gets loaded here and serialized into
// a single readable block.
//
// Caps and recency filters keep the payload bounded as the user's
// history grows. The constants are tuned for "useful enough for
// the AI to keep things consistent" without ballooning context
// cost — see the in-line rationale at each cap.

// Most-active themes by last_used_at desc. The AI sees this list
// in every analysis and is told to reuse on >80% semantic match
// instead of inventing new variants. Cap at 25 — beyond this the
// AI's working memory of consistent labeling stops helping.
const THEME_VOCAB_CAP = 25;

// Recent shifts to pass through. The AI uses these for cross-
// session context ("today connects to what you noticed last
// week...") and as the eligible pool for contributing_shift_ids on
// breakthroughs. 15 covers ~6 months of typical shift cadence.
const RECENT_SHIFTS_CAP = 15;

// Recent breakthroughs to pass through. Far rarer than shifts;
// 5 covers ~6 months of typical breakthrough cadence and is
// enough for cross-session connection.
const RECENT_BREAKTHROUGHS_CAP = 5;

// Recent sessions surfaced for the AI to reference as
// `contributing_session_ids` on shifts/breakthroughs.
const RECENT_SESSIONS_CAP = 30;

const COACH_BY_VALUE = new Map(COACHES.map((c) => [c.value, c]));

// Display label for a coach. Falls back to a generic friendly tone
// when the coach_name is null / unknown — happens for users whose
// onboarding row got into a weird state, plus the cron path.
function coachPersona(coachName: string | null): {
  name: string;
  description: string;
} {
  if (!coachName) {
    return { name: "your coach", description: "warm and grounded, helps you reflect" };
  }
  const c = COACH_BY_VALUE.get(coachName);
  if (!c) {
    return { name: coachName, description: "warm and grounded, helps you reflect" };
  }
  return { name: c.label, description: c.description };
}

// Read the user's first name from public.users.display_name. No
// Clerk fallback because session-end can run from the abandonment
// cron path (service_role, no Clerk session). Falls back to
// "friend" so the prompt never renders an empty placeholder.
async function readClientFirstName(ctx: UserSupabase): Promise<string> {
  const { data, error } = await ctx.client
    .from("users")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) return "friend";
  return data?.display_name?.trim() || "friend";
}

type ThemeRow = {
  id: string;
  label: string;
  description: string | null;
  last_used_at: string;
};

type RecentShiftRow = {
  id: string;
  content: string;
  created_at: string;
  user_disagreed_at: string | null;
};

type RecentBreakthroughRow = {
  id: string;
  content: string;
  created_at: string;
  user_disagreed_at: string | null;
};

type RecentSessionRow = {
  id: string;
  ended_at: string | null;
};

// Stringifies "N days ago" for relative-recency display in the
// payload. Helps the AI gauge "how stale is this" without doing
// date arithmetic.
function daysAgo(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function formatActiveGoals(goals: ActiveGoal[]): string {
  if (goals.length === 0) return "(none)";
  return goals
    .map((g) => {
      const progress =
        g.progress_percent === null ? "n/a" : `${g.progress_percent}%`;
      const desc = g.description ? `\n  ${g.description}` : "";
      return `- ${g.id} | "${g.title}" | progress: ${progress} | status: ${g.status}${desc}`;
    })
    .join("\n");
}

function formatThemes(rows: ThemeRow[], now: number): string {
  if (rows.length === 0) return "(none yet — this user has no theme history)";
  return rows
    .map((t) => {
      const desc = t.description ? ` — ${t.description}` : "";
      return `- "${t.label}"${desc} (last used ${daysAgo(t.last_used_at, now)})`;
    })
    .join("\n");
}

function formatShifts(rows: RecentShiftRow[], now: number): string {
  if (rows.length === 0) return "(none yet)";
  return rows
    .map((s) => {
      const flag = s.user_disagreed_at ? " | user_disagreed=true" : "";
      return `- [${s.id} | ${daysAgo(s.created_at, now)}${flag}] ${s.content}`;
    })
    .join("\n");
}

function formatBreakthroughs(rows: RecentBreakthroughRow[], now: number): string {
  if (rows.length === 0) return "(none yet)";
  return rows
    .map((b) => {
      const flag = b.user_disagreed_at ? " | user_disagreed=true" : "";
      return `- [${b.id} | ${daysAgo(b.created_at, now)}${flag}] ${b.content}`;
    })
    .join("\n");
}

function formatSessions(rows: RecentSessionRow[], now: number): string {
  if (rows.length === 0) return "(none yet)";
  return rows
    .map((s) => {
      const when = s.ended_at ? daysAgo(s.ended_at, now) : "in progress";
      return `- [${s.id} | ${when}]`;
    })
    .join("\n");
}

// Loads the four DB-shape inputs in parallel. The active-goals
// loader is the lazy-seed version (idempotent) so the cron path
// also self-heals if needed.
async function loadInputs(
  ctx: UserSupabase,
  coachName: string | null,
  currentSessionId: string,
): Promise<{
  firstName: string;
  persona: { name: string; description: string };
  goals: ActiveGoal[];
  themes: ThemeRow[];
  shifts: RecentShiftRow[];
  breakthroughs: RecentBreakthroughRow[];
  sessions: RecentSessionRow[];
}> {
  const persona = coachPersona(coachName);
  const [firstName, goals, themesRes, shiftsRes, breakthroughsRes, sessionsRes] =
    await Promise.all([
      readClientFirstName(ctx),
      loadActiveGoalsWithLazySeed(ctx),
      ctx.client
        .from("themes")
        .select("id, label, description, last_used_at")
        .order("last_used_at", { ascending: false })
        .limit(THEME_VOCAB_CAP),
      ctx.client
        .from("insights")
        .select("id, content, created_at, user_disagreed_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_SHIFTS_CAP),
      ctx.client
        .from("breakthroughs")
        .select("id, content, created_at, user_disagreed_at")
        .order("created_at", { ascending: false })
        .limit(RECENT_BREAKTHROUGHS_CAP),
      // Exclude the current session — it's the SOURCE of any
      // shifts/breakthroughs we'll emit, not a contributor TO them.
      // Letting it into the eligible pool tempts the AI to self-cite.
      ctx.client
        .from("sessions")
        .select("id, ended_at")
        .not("ended_at", "is", null)
        .neq("id", currentSessionId)
        .order("ended_at", { ascending: false })
        .limit(RECENT_SESSIONS_CAP),
    ]);
  if (themesRes.error) throw themesRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (breakthroughsRes.error) throw breakthroughsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  return {
    firstName,
    persona,
    goals,
    themes: (themesRes.data ?? []) as ThemeRow[],
    shifts: (shiftsRes.data ?? []) as RecentShiftRow[],
    breakthroughs: (breakthroughsRes.data ?? []) as RecentBreakthroughRow[],
    sessions: (sessionsRes.data ?? []) as RecentSessionRow[],
  };
}

// Public: build the structured-text payload that prompt-session-
// end-v6 expects under "What you receive". Returned as a single
// developer-role message body.
export async function buildSessionEndContext(
  ctx: UserSupabase,
  coachName: string | null,
  currentSessionId: string,
): Promise<string> {
  const inputs = await loadInputs(ctx, coachName, currentSessionId);
  const now = Date.now();
  return [
    `=== Client ===`,
    `First name: ${inputs.firstName}`,
    ``,
    `=== Coach Persona ===`,
    `Name: ${inputs.persona.name}`,
    `Description: ${inputs.persona.description}`,
    ``,
    `=== Active Goals ===`,
    formatActiveGoals(inputs.goals),
    ``,
    `=== Theme Vocabulary (most-recent first) ===`,
    formatThemes(inputs.themes, now),
    ``,
    `=== Recent Mindset Shifts (most-recent first; user_disagreed flag means do NOT cite as a contributor) ===`,
    formatShifts(inputs.shifts, now),
    ``,
    `=== Recent Breakthroughs (most-recent first; same disagreement rule) ===`,
    formatBreakthroughs(inputs.breakthroughs, now),
    ``,
    `=== Recent Sessions (most-recent first; eligible pool for contributing_session_ids) ===`,
    formatSessions(inputs.sessions, now),
  ].join("\n");
}

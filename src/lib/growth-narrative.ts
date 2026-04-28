import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { COACHES } from "@/app/onboarding/data";
import { captureSessionError } from "@/lib/observability";
import {
  MODEL_GROWTH_NARRATIVE,
  openaiClient,
} from "@/lib/openai";
import type { UserSupabase } from "@/lib/supabase";

// Bundled at build time via next.config.ts outputFileTracingIncludes.
const NARRATIVE_PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-growth-narrative-v1.md"),
  "utf8",
).trim();

// Generous budget — the narrative can run 350-650 words and we
// don't want truncation to cap it artificially. 3000 covers the
// upper end with comfortable headroom.
const MAX_OUTPUT_TOKENS = 3000;

// How many prior sessions to include in the index. The arc-finder
// benefit grows sub-linearly past ~60; capping keeps the prompt
// small even after years of use.
const SESSION_INDEX_CAP = 60;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["growth_narrative"],
  properties: {
    growth_narrative: { type: "string" },
  },
} as const;

const COACH_BY_VALUE = new Map(COACHES.map((c) => [c.value, c]));

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

function daysAgo(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

type IndexRow = {
  id: string;
  ended_at: string | null;
  progress_summary_short: string | null;
  themes: string[];
};

type RecentSessionData = {
  id: string;
  ended_at: string | null;
  summary: string | null;
  progress_summary_short: string | null;
  themes: { label: string; direction: string; intensity: number | null }[];
};

// Build the developer-message context string the prompt expects.
async function buildContext(
  ctx: UserSupabase,
  sessionId: string,
): Promise<string | null> {
  const userId = ctx.userId;

  const [
    userRes,
    onbRes,
    coachingStateRes,
    sessionRes,
    sessionThemesRes,
    indexRes,
    activeGoalsRes,
    shiftsRes,
    breakthroughsRes,
  ] = await Promise.all([
    ctx.client
      .from("users")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
    ctx.client
      .from("onboarding_selections")
      .select("coach_name")
      .maybeSingle(),
    ctx.client
      .from("coaching_state")
      .select("growth_narrative")
      .maybeSingle(),
    ctx.client
      .from("sessions")
      .select("id, ended_at, summary, progress_summary_short")
      .eq("id", sessionId)
      .maybeSingle(),
    ctx.client
      .from("session_themes")
      .select("intensity, direction, themes(label)")
      .eq("session_id", sessionId),
    ctx.client
      .from("sessions")
      .select(
        "id, ended_at, progress_summary_short, session_themes(themes(label))",
      )
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(SESSION_INDEX_CAP),
    ctx.client
      .from("goals")
      .select("title, status")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    ctx.client
      .from("insights")
      .select("content, created_at, user_disagreed_at")
      .order("created_at", { ascending: false })
      .limit(15),
    ctx.client
      .from("breakthroughs")
      .select("content, galaxy_name, created_at, user_disagreed_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (sessionRes.error) throw sessionRes.error;
  if (sessionThemesRes.error) throw sessionThemesRes.error;
  if (indexRes.error) throw indexRes.error;
  if (activeGoalsRes.error) throw activeGoalsRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (breakthroughsRes.error) throw breakthroughsRes.error;

  if (!sessionRes.data) return null;

  const firstName = userRes.data?.display_name?.trim() || "friend";
  const persona = coachPersona(onbRes.data?.coach_name ?? null);
  const previous = coachingStateRes.data?.growth_narrative?.trim() || null;

  // Supabase's generated types model the join as 1-many even when the
  // FK is 1-1, so themes can come back as either an object or an
  // array. The shape-narrowing helper handles both.
  function readJoinedLabel(joined: unknown): string | null {
    if (!joined || typeof joined !== "object") return null;
    if (Array.isArray(joined)) {
      const first = joined[0];
      return typeof first === "object" && first && "label" in first
        ? String((first as { label?: unknown }).label ?? "") || null
        : null;
    }
    const label = (joined as { label?: unknown }).label;
    return typeof label === "string" && label ? label : null;
  }

  type ThemeJoinRow = {
    intensity: number | null;
    direction: string;
    themes: unknown;
  };
  const recentSession: RecentSessionData = {
    id: sessionRes.data.id,
    ended_at: sessionRes.data.ended_at,
    summary: sessionRes.data.summary,
    progress_summary_short: sessionRes.data.progress_summary_short,
    themes: ((sessionThemesRes.data ?? []) as ThemeJoinRow[])
      .map((t) => ({
        label: readJoinedLabel(t.themes) ?? "",
        direction: t.direction,
        intensity: t.intensity,
      }))
      .filter((t) => t.label),
  };

  type IndexJoinRow = {
    id: string;
    ended_at: string | null;
    progress_summary_short: string | null;
    session_themes: { themes: unknown }[] | null;
  };
  const index: IndexRow[] = ((indexRes.data ?? []) as IndexJoinRow[]).map(
    (s) => ({
      id: s.id,
      ended_at: s.ended_at,
      progress_summary_short: s.progress_summary_short,
      themes: (s.session_themes ?? [])
        .map((st) => readJoinedLabel(st.themes))
        .filter((x): x is string => !!x)
        .slice(0, 3),
    }),
  );

  const goals = (activeGoalsRes.data ?? []) as Array<{
    title: string;
    status: string;
  }>;
  const shifts = (shiftsRes.data ?? []) as Array<{
    content: string;
    created_at: string;
    user_disagreed_at: string | null;
  }>;
  const breakthroughs = (breakthroughsRes.data ?? []) as Array<{
    content: string;
    galaxy_name: string | null;
    created_at: string;
    user_disagreed_at: string | null;
  }>;

  const now = Date.now();

  const indexBlock = index.length === 0
    ? "(none yet)"
    : index
        .slice()
        .reverse() // chronological for the AI's arc-reading
        .map((s) => {
          const when = s.ended_at ? daysAgo(s.ended_at, now) : "in progress";
          const title = s.progress_summary_short?.trim() || "(untitled)";
          const themes =
            s.themes.length > 0 ? ` | themes: ${s.themes.join(", ")}` : "";
          return `- [${when}] ${title}${themes}`;
        })
        .join("\n");

  const recentSessionBlock = [
    `Title: ${recentSession.progress_summary_short ?? "(untitled)"}`,
    `Date: ${recentSession.ended_at ? daysAgo(recentSession.ended_at, now) : "today"}`,
    `Summary: ${recentSession.summary ?? "(no summary written)"}`,
    recentSession.themes.length > 0
      ? `Themes: ${recentSession.themes
          .map(
            (t) =>
              `${t.label} (${t.direction}${t.intensity != null ? `, intensity ${t.intensity}` : ""})`,
          )
          .join("; ")}`
      : "Themes: (none)",
  ].join("\n");

  const goalsBlock = goals.length === 0
    ? "(none)"
    : goals.map((g) => `- "${g.title}" — ${g.status}`).join("\n");

  const shiftsBlock = shifts.length === 0
    ? "(none yet)"
    : shifts
        .map(
          (s) =>
            `- [${daysAgo(s.created_at, now)}${s.user_disagreed_at ? " | user_disagreed=true" : ""}] ${s.content}`,
        )
        .join("\n");

  const breakthroughsBlock = breakthroughs.length === 0
    ? "(none yet)"
    : breakthroughs
        .map((b) => {
          const name = b.galaxy_name ? ` "${b.galaxy_name}"` : "";
          return `- [${daysAgo(b.created_at, now)}${b.user_disagreed_at ? " | user_disagreed=true" : ""}]${name} ${b.content}`;
        })
        .join("\n");

  return [
    `=== Client ===`,
    `First name: ${firstName}`,
    `Coach Persona: ${persona.name} — ${persona.description}`,
    ``,
    `=== Previous Growth Narrative ===`,
    previous ?? "(none yet — write the opening narrative)",
    ``,
    `=== Most Recent Session ===`,
    recentSessionBlock,
    ``,
    `=== Session Index (oldest → newest) ===`,
    indexBlock,
    ``,
    `=== Active Goals ===`,
    goalsBlock,
    ``,
    `=== Recent Mindset Shifts (most-recent first; skip user_disagreed=true) ===`,
    shiftsBlock,
    ``,
    `=== Recent Breakthroughs (most-recent first; skip user_disagreed=true) ===`,
    breakthroughsBlock,
  ].join("\n");
}

// Runs the growth-narrative prompt and writes the result to
// coaching_state.growth_narrative. Idempotent enough — re-running
// for the same session produces a re-rendered narrative; calling it
// twice in a row is wasteful but not destructive.
export async function runGrowthNarrativeUpdate(
  ctx: UserSupabase,
  sessionId: string,
): Promise<boolean> {
  const userId = ctx.userId;
  const context = await buildContext(ctx, sessionId);
  if (!context) return false;

  let response;
  try {
    response = await openaiClient().responses.create({
      model: MODEL_GROWTH_NARRATIVE,
      input: [
        { role: "developer", content: NARRATIVE_PROMPT },
        { role: "developer", content: context },
        {
          role: "user",
          content:
            "Write the rolling growth narrative for this user, following all rules above.",
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "json_schema",
          name: "growth_narrative_update",
          schema: SCHEMA,
          strict: true,
        },
      },
    });
  } catch (err) {
    captureSessionError(err, "growth_narrative_openai", sessionId);
    throw err;
  }

  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    const err = new Error(
      `growth narrative response not completed: status=${response.status}, reason=${reason}`,
    );
    captureSessionError(err, "growth_narrative_truncated", sessionId);
    throw err;
  }

  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const c of item.content) {
      if (c.type === "refusal") {
        const err = new Error(`growth narrative model refused: ${c.refusal}`);
        captureSessionError(err, "growth_narrative_refusal", sessionId);
        throw err;
      }
    }
  }

  let parsed: { growth_narrative?: string };
  try {
    parsed = JSON.parse(response.output_text) as { growth_narrative?: string };
  } catch (err) {
    captureSessionError(err, "growth_narrative_openai", sessionId);
    throw err;
  }

  const narrative = parsed.growth_narrative?.trim();
  if (!narrative) return false;

  const { error } = await ctx.client
    .from("coaching_state")
    .upsert(
      {
        user_id: userId,
        growth_narrative: narrative,
        growth_narrative_updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    captureSessionError(error, "growth_narrative_db_write", sessionId);
    throw error;
  }
  return true;
}

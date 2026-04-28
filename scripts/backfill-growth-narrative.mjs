// One-off backfill that walks a user's analyzed sessions in
// chronological order and runs the growth-narrative prompt for each,
// so the rolling letter on Home reflects the user's full history
// instead of starting empty.
//
// The script duplicates a minimal slice of the runtime narrative
// pipeline (prompt build + OpenAI call + coaching_state write).
// Keeps it independent of the Next.js runtime so tsx isn't required.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-growth-narrative.mjs <user_id>

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: node --env-file=.env.local scripts/backfill-growth-narrative.mjs <user_id>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
const openai = new OpenAI({ apiKey: OPENAI_KEY, timeout: 240_000 });

const MODEL = "gpt-5";
const MAX_OUTPUT_TOKENS = 3000;
const SESSION_INDEX_CAP = 60;

const PROMPT = readFileSync(
  path.join(process.cwd(), "reference", "prompt-growth-narrative-v1.md"),
  "utf8",
).trim();

const COACHES = {
  buddy: { label: "Buddy", description: "Friendly and encouraging, like having a supportive friend" },
  dante: { label: "Dante", description: "Wise and thoughtful, guides you through deep reflections" },
  kelly: { label: "Kelly", description: "Energetic and motivating, helps you take action" },
  maya: { label: "Maya", description: "Calm and centered, helps you find inner peace" },
  orion: { label: "Orion", description: "Adventurous and bold, encourages you to explore new paths" },
  pierre: { label: "Pierre", description: "Sophisticated and insightful, offers elegant solutions" },
  sigmund: { label: "Sigmund", description: "Analytical and deep, helps you understand yourself better" },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["growth_narrative"],
  properties: { growth_narrative: { type: "string" } },
};

function daysAgo(iso, now) {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

async function loadSessions() {
  const { data, error } = await sb
    .from("sessions")
    .select("id, ended_at, summary, progress_summary_short")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .not("summary", "is", null)
    .order("ended_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadOnboardingAndUser() {
  const [u, o] = await Promise.all([
    sb.from("users").select("display_name").eq("id", userId).maybeSingle(),
    sb.from("onboarding_selections").select("coach_name").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    firstName: u.data?.display_name?.trim() || "friend",
    coach: COACHES[o.data?.coach_name] ?? { label: "your coach", description: "warm and grounded, helps you reflect" },
  };
}

async function loadSessionThemes(sessionId) {
  const { data, error } = await sb
    .from("session_themes")
    .select("intensity, direction, themes(label)")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? [])
    .map((t) => ({ label: t.themes?.label ?? "", direction: t.direction, intensity: t.intensity }))
    .filter((t) => t.label);
}

async function loadIndex(throughSessionId) {
  // Index is "all sessions ended on or before throughSession's ended_at",
  // chronological for the AI's arc-reading.
  const target = await sb
    .from("sessions")
    .select("ended_at")
    .eq("id", throughSessionId)
    .maybeSingle();
  if (target.error) throw target.error;
  if (!target.data?.ended_at) return [];
  const { data, error } = await sb
    .from("sessions")
    .select("id, ended_at, progress_summary_short, session_themes(themes(label))")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .lte("ended_at", target.data.ended_at)
    .order("ended_at", { ascending: true })
    .limit(SESSION_INDEX_CAP);
  if (error) throw error;
  return data ?? [];
}

async function loadGoals() {
  const { data, error } = await sb
    .from("goals")
    .select("title, status")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function loadShifts(throughIso) {
  const { data, error } = await sb
    .from("insights")
    .select("content, created_at, user_disagreed_at")
    .eq("user_id", userId)
    .lte("created_at", throughIso)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return data ?? [];
}

async function loadBreakthroughs(throughIso) {
  const { data, error } = await sb
    .from("breakthroughs")
    .select("content, galaxy_name, created_at, user_disagreed_at")
    .eq("user_id", userId)
    .lte("created_at", throughIso)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

async function getCurrentNarrative() {
  const { data, error } = await sb
    .from("coaching_state")
    .select("growth_narrative")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.growth_narrative?.trim() || null;
}

async function buildContext(session, persona, firstName) {
  const now = Date.parse(session.ended_at);
  const [themes, index, goals, shifts, breakthroughs, previous] = await Promise.all([
    loadSessionThemes(session.id),
    loadIndex(session.id),
    loadGoals(),
    loadShifts(session.ended_at),
    loadBreakthroughs(session.ended_at),
    getCurrentNarrative(),
  ]);

  const indexBlock = index.length === 0
    ? "(none yet)"
    : index
        .map((s) => {
          const when = s.ended_at ? daysAgo(s.ended_at, now) : "in progress";
          const title = s.progress_summary_short?.trim() || "(untitled)";
          const tlist = (s.session_themes ?? [])
            .map((st) => st.themes?.label)
            .filter(Boolean)
            .slice(0, 3);
          const themesPart = tlist.length > 0 ? ` | themes: ${tlist.join(", ")}` : "";
          return `- [${when}] ${title}${themesPart}`;
        })
        .join("\n");

  const recentSessionBlock = [
    `Title: ${session.progress_summary_short ?? "(untitled)"}`,
    `Date: ${daysAgo(session.ended_at, now)}`,
    `Summary: ${session.summary ?? "(no summary written)"}`,
    themes.length > 0
      ? `Themes: ${themes
          .map((t) => `${t.label} (${t.direction}${t.intensity != null ? `, intensity ${t.intensity}` : ""})`)
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

  const brBlock = breakthroughs.length === 0
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
    `Coach Persona: ${persona.label} — ${persona.description}`,
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
    brBlock,
  ].join("\n");
}

async function runOnce(session, persona, firstName) {
  const context = await buildContext(session, persona, firstName);
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      { role: "developer", content: PROMPT },
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
  if (response.status !== "completed") {
    throw new Error(`response not completed: ${response.status} / ${response.incomplete_details?.reason ?? "unknown"}`);
  }
  const parsed = JSON.parse(response.output_text);
  const narrative = parsed.growth_narrative?.trim();
  if (!narrative) throw new Error("empty narrative");

  const { error } = await sb.from("coaching_state").upsert(
    {
      user_id: userId,
      growth_narrative: narrative,
      growth_narrative_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return narrative;
}

async function main() {
  console.log(`backfilling growth narrative for user: ${userId}`);
  const sessions = await loadSessions();
  console.log(`  ${sessions.length} analyzed sessions to walk`);
  if (sessions.length === 0) return;
  const { firstName, coach } = await loadOnboardingAndUser();
  console.log(`  client=${firstName}, coach=${coach.label}`);

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const t0 = Date.now();
    process.stdout.write(`  [${i + 1}/${sessions.length}] ${s.id.slice(0, 8)} ${s.ended_at?.slice(0, 10)}... `);
    try {
      const narrative = await runOnce(s, coach, firstName);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`ok in ${sec}s, ${narrative.length} chars`);
    } catch (err) {
      console.log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
  console.log("DONE");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

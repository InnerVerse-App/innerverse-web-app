// Pretty-print the full AI analysis from a fixture session row.
// Use after running scripts/run-fixture.mjs to read the stored
// content in human-friendly form (no JSON, no truncation).
//
// Usage:
//   node --env-file=.env.local scripts/report-fixture.mjs              # most recent
//   node --env-file=.env.local scripts/report-fixture.mjs <session-id> # specific

import { createClient } from "@supabase/supabase-js";

const FIXTURE_USER_ID = "fixture_test_user_v5a";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sessionId = process.argv[2];

async function pickSession() {
  if (sessionId) {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", FIXTURE_USER_ID)
    .order("ended_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) {
    console.error(
      `No fixture sessions found under user_id '${FIXTURE_USER_ID}'. Run scripts/run-fixture.mjs first.`,
    );
    process.exit(1);
  }
  return data[0];
}

function divider(char = "─", n = 70) {
  console.log(char.repeat(n));
}

function heading(title) {
  console.log("");
  divider("━");
  console.log(`  ${title.toUpperCase()}`);
  divider("━");
}

function field(label, value) {
  if (value === null || value === undefined || value === "") {
    console.log(`${label}: (empty)`);
    return;
  }
  console.log(`${label}: ${value}`);
}

function paragraph(label, text) {
  if (!text) {
    console.log(`${label}: (empty)`);
    return;
  }
  console.log(`${label}:`);
  console.log("");
  // Indent each line 2 spaces; preserve paragraph breaks.
  const indented = text
    .split("\n")
    .map((l) => (l.length ? `  ${l}` : ""))
    .join("\n");
  console.log(indented);
  console.log("");
}

async function main() {
  const s = await pickSession();

  heading(`Session ${s.id}`);
  field("Started", s.started_at);
  field("Ended", s.ended_at);
  field("Substantive", s.is_substantive);
  field("Trauma protocol triggered", s.trauma_protocol_triggered);

  heading("Coach narrative (shown to user post-session)");
  paragraph("", s.coach_narrative);

  heading("Sub-scores (0-10 each)");
  const r = s.score_rationales ?? {};
  function scoreLine(label, key, value) {
    console.log(`${label}: ${value}`);
    if (r[key]) console.log(`    rationale: ${r[key]}`);
  }
  scoreLine("Self-disclosure       ", "self_disclosure", s.self_disclosure_score);
  scoreLine("Cognitive shift       ", "cognitive_shift", s.cognitive_shift_score);
  scoreLine(
    "Emotional integration ",
    "emotional_integration",
    s.emotional_integration_score,
  );
  scoreLine("Novelty               ", "novelty", s.novelty_score);
  field("Progress percent      ", s.progress_percent);

  heading("Session summary");
  paragraph("", s.summary);

  heading("Progress summary (short)");
  paragraph("", s.progress_summary_short);

  heading("Coach message (cross-session memory hook)");
  paragraph("", s.coach_message);

  // Themes
  const { data: themes } = await supabase
    .from("session_themes")
    .select("*, themes(label, description)")
    .eq("session_id", s.id);

  heading(`Themes (${themes?.length ?? 0})`);
  for (const t of themes ?? []) {
    console.log(`▸ ${t.themes?.label ?? "(unknown)"}`);
    field("    intensity (0-10)", t.intensity);
    field("    direction       ", t.direction);
    if (t.themes?.description) field("    description     ", t.themes.description);
    if (t.score_rationale) {
      console.log(`    rationale       :`);
      console.log(`      ${t.score_rationale}`);
    }
    if (t.evidence_quote) {
      console.log(`    evidence quote  :`);
      console.log(`      "${t.evidence_quote}"`);
    }
    if (t.user_disagreed_at) {
      console.log(`    USER DISAGREED  : ${t.user_disagreed_at}`);
      if (t.user_disagreement_note) {
        console.log(`      note: "${t.user_disagreement_note}"`);
      }
    }
    console.log("");
  }

  // Mindset shifts
  const { data: shifts } = await supabase
    .from("insights")
    .select("*")
    .eq("session_id", s.id);

  heading(`Mindset shifts (${shifts?.length ?? 0})`);
  if (!shifts?.length) {
    console.log("(none — the rubric did not promote anything to shift territory)");
  }
  for (const sh of shifts ?? []) {
    console.log(`▸ ${sh.content}`);
    field("    combined_score  ", sh.combined_score);
    if (sh.evidence_quote) {
      console.log(`    evidence quote  :`);
      console.log(`      "${sh.evidence_quote}"`);
    }
    if (sh.contributing_session_ids?.length) {
      field("    contributing_sessions", sh.contributing_session_ids.length);
    }
    if (sh.user_disagreed_at) {
      field("    USER DISAGREED  ", sh.user_disagreed_at);
      if (sh.user_disagreement_note) {
        console.log(`    disagreement note:`);
        console.log(`      "${sh.user_disagreement_note}"`);
      }
    }
    console.log("");
  }

  // Breakthroughs
  const { data: bts } = await supabase
    .from("breakthroughs")
    .select("*")
    .eq("session_id", s.id);

  heading(`Breakthroughs (${bts?.length ?? 0})`);
  if (!bts?.length) {
    console.log("(none — breakthroughs are rarer than shifts)");
  }
  for (const b of bts ?? []) {
    console.log(`▸ ${b.content}`);
    field("    galaxy name     ", b.galaxy_name);
    field("    combined_score  ", b.combined_score);
    if (b.evidence_quote) {
      console.log(`    evidence quote  :`);
      console.log(`      "${b.evidence_quote}"`);
    }
    if (b.contributing_session_ids?.length)
      field("    contributing_sessions", b.contributing_session_ids.length);
    if (b.contributing_shift_ids?.length)
      field("    contributing_shifts ", b.contributing_shift_ids.length);
    if (b.direct_session_ids?.length)
      field("    direct_sessions     ", b.direct_session_ids.length);
    if (b.user_disagreed_at) {
      field("    USER DISAGREED  ", b.user_disagreed_at);
      if (b.user_disagreement_note) {
        console.log(`    disagreement note:`);
        console.log(`      "${b.user_disagreement_note}"`);
      }
    }
    console.log("");
  }

  // User response (if any)
  if (s.user_response_text) {
    heading("User's free-text reflection");
    paragraph("", s.user_response_text);

    heading("Call 2 (response-parser) result");
    field("Response parsed at", s.response_parsed_at ?? "(not yet parsed)");
    const disagreedShifts = shifts?.filter((x) => x.user_disagreed_at) ?? [];
    const disagreedBts = bts?.filter((x) => x.user_disagreed_at) ?? [];
    field("Shifts user disagreed with     ", disagreedShifts.length);
    field("Breakthroughs user disagreed with", disagreedBts.length);
    if (
      disagreedShifts.length === 0 &&
      disagreedBts.length === 0 &&
      s.response_parsed_at
    ) {
      console.log("");
      console.log(
        "  Call 2 emitted no disagreements — model judged the reflection as agreement, addition, or silent on prior claims.",
      );
    }
  }

  console.log("");
  divider("━");
  console.log(`  END OF SESSION ${s.id}`);
  divider("━");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

// One-off test for the 2026-04-23 audit FINDINGS 6 + 7 fix.
// Invokes process_session_end against innerverse-dev with
// malformed inputs that would have rolled back the pre-fix
// function. Deletes the throwaway session row at the end.
//
// Run: node --env-file=.env.local scripts/test-rpc-hardening.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TEST_USER_ID = "audit_test_user_2026_04_23";
let sessionId = null;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(2);
  }
  console.log("PASS:", message);
}

async function setup() {
  // Upsert a throwaway users row with only the id (email nullable).
  const { error: userErr } = await supabase
    .from("users")
    .upsert({ id: TEST_USER_ID }, { onConflict: "id", ignoreDuplicates: true });
  if (userErr) throw userErr;

  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: TEST_USER_ID })
    .select("id")
    .single();
  if (error) throw error;
  sessionId = data.id;
  console.log(`setup: created session ${sessionId}`);
}

async function test3A_progressPercentClamp() {
  console.log("\n--- Test 3A: out-of-range progress_percent ---");
  const { data, error } = await supabase.rpc("process_session_end", {
    p_session_id: sessionId,
    p_analysis: {
      session_summary: "test 3A",
      progress_percent: 9999,
      breakthroughs: ["3A"],
      mindset_shifts: [],
      recommended_next_steps: [],
      language_patterns_observed: [],
      tool_glossary_suggestions: [],
      style_calibration_delta: { directness: 0, warmth: 0, challenge: 0 },
    },
  });
  assert(!error, `RPC returned no error (got: ${error?.message ?? "none"})`);
  assert(data === true, `RPC returned true`);

  const { data: row, error: rowErr } = await supabase
    .from("sessions")
    .select("summary, progress_percent")
    .eq("id", sessionId)
    .single();
  if (rowErr) throw rowErr;
  assert(row.summary === "test 3A", `summary set to 'test 3A' (got: ${row.summary})`);
  assert(row.progress_percent === 100, `progress_percent clamped to 100 (got: ${row.progress_percent})`);
}

async function test3B_malformedArrays() {
  console.log("\n--- Test 3B: non-array fields ---");
  // Reset summary so the idempotency guard doesn't short-circuit.
  const { error: resetErr } = await supabase
    .from("sessions")
    .update({ summary: null })
    .eq("id", sessionId);
  if (resetErr) throw resetErr;
  // Delete any child rows from 3A so the count assertion is clean.
  await supabase.from("breakthroughs").delete().eq("session_id", sessionId);

  const { data, error } = await supabase.rpc("process_session_end", {
    p_session_id: sessionId,
    p_analysis: {
      session_summary: "test 3B",
      progress_percent: 50,
      breakthroughs: null,
      mindset_shifts: "oops a string",
      recommended_next_steps: { oops: "object" },
      language_patterns_observed: null,
      tool_glossary_suggestions: "not an array",
      style_calibration_delta: { directness: 0, warmth: 0, challenge: 0 },
    },
  });
  assert(!error, `RPC returned no error (got: ${error?.message ?? "none"})`);
  assert(data === true, `RPC returned true`);

  const { data: row, error: rowErr } = await supabase
    .from("sessions")
    .select("summary, progress_percent, language_patterns_observed, tool_glossary_suggestions")
    .eq("id", sessionId)
    .single();
  if (rowErr) throw rowErr;
  assert(row.summary === "test 3B", `summary set to 'test 3B' (got: ${row.summary})`);
  assert(Array.isArray(row.language_patterns_observed) && row.language_patterns_observed.length === 0, `language_patterns_observed defaulted to empty array`);
  assert(Array.isArray(row.tool_glossary_suggestions) && row.tool_glossary_suggestions.length === 0, `tool_glossary_suggestions defaulted to empty array`);

  const { count: bCount } = await supabase
    .from("breakthroughs")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  const { count: iCount } = await supabase
    .from("insights")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  const { count: nCount } = await supabase
    .from("next_steps")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  assert(bCount === 0, `breakthroughs inserted: 0 (got: ${bCount})`);
  assert(iCount === 0, `insights inserted: 0 (got: ${iCount})`);
  assert(nCount === 0, `next_steps inserted: 0 (got: ${nCount})`);
}

async function cleanup() {
  console.log("\n--- Cleanup ---");
  if (sessionId) {
    await supabase.from("breakthroughs").delete().eq("session_id", sessionId);
    await supabase.from("insights").delete().eq("session_id", sessionId);
    await supabase.from("next_steps").delete().eq("session_id", sessionId);
    await supabase.from("sessions").delete().eq("id", sessionId);
  }
  await supabase.from("coaching_state").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  console.log("cleanup complete");
}

try {
  await setup();
  await test3A_progressPercentClamp();
  await test3B_malformedArrays();
  console.log("\nAll RPC hardening tests passed.");
} catch (err) {
  console.error("ERROR:", err);
  process.exit(3);
} finally {
  await cleanup();
}

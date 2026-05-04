import { NextResponse } from "next/server";

import { captureSessionError } from "@/lib/observability";
import { runSessionEndAnalysis } from "@/lib/session-end";
import { SUBSTANTIVE_MESSAGE_THRESHOLD } from "@/lib/sessions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case: up to SWEEP_BATCH_LIMIT stale + SWEEP_BATCH_LIMIT retry
// sessions, each triggering a ~3s OpenAI call sequentially. Vercel
// Hobby's 10s default would time out on even a handful. 60s is the
// Hobby cap and gives headroom for ~20 analyses per run.
export const maxDuration = 60;

// Abandoned-session sweep. Scheduled daily at 09:00 UTC by Vercel
// Cron (vercel.json) and triggerable on demand via the dashboard
// "Run now" button. Finds sessions that were never ended and whose
// most recent message is at least STALE_IDLE_MINUTES old, closes
// them, and runs gpt-5 analysis for any that crossed the
// substantive threshold.
//
// Daily schedule is the Vercel Hobby cron cap. This is acceptable
// at current tester scale because (a) operator can "Run now" from
// the dashboard when testing, and (b) real-user abandonment is
// rare enough that once-daily cleanup is fine for v1. Revisit
// before the >10-tester gate — either upgrade to Pro for sub-daily
// schedules or wire an external cron service. See Docs/KNOWN_FOLLOW_UPS.md.
//
// Auth: Vercel Cron adds an Authorization: Bearer <CRON_SECRET>
// header automatically when CRON_SECRET is set in env vars. The
// check below is both the auth for cron and the gate against
// external abuse. Manual testing: use the Run-now button from
// the Vercel dashboard, or curl the endpoint with the secret.

// Tightened from 30 → 5 after adding the auto-end beacon (ChatView's
// pagehide handler). The beacon catches the typical case (clean tab
// close); this cron is the safety net for sessions where the beacon
// didn't fire (browser crash, dirty tab kill, beacon network
// failure, etc.). 5 min is short enough that cron sweeps don't
// pile up but long enough that a user briefly switching tabs and
// returning doesn't get their session closed.
const STALE_IDLE_MINUTES = 5;
// Resume window for non-substantive sessions. Most testers don't
// click End — they just close the app. If a user has an in-flight
// session under the substantive threshold (a real conversation
// they got distracted from), we want them to come back and pick
// it up rather than seeing it auto-closed and a fresh session
// greeting them. Sub-substantive sessions stay OPEN until they
// pass this idle window, then get deleted entirely (no value in
// keeping a row around for an analysis that won't happen).
// Substantive sessions still close + analyze at
// STALE_IDLE_MINUTES — they have content worth surfacing now.
//
// 72h matches non-daily usage patterns common in wellness apps —
// a tester who started something Friday and is busy through the
// weekend can still pick it up Monday without losing their thread.
// Storage cost is negligible and the auto-discard on Start-new
// handles any accumulation regardless of window length.
const RESUME_WINDOW_HOURS = 72;
const RESUME_WINDOW_MS = RESUME_WINDOW_HOURS * 60 * 60 * 1000;
const SWEEP_BATCH_LIMIT = 50;

type CandidateSession = {
  id: string;
  user_id: string;
  message_count: number;
  user_message_count: number;
  // Newest message timestamp — used to compute idle duration so
  // we can decide between "leave open for resume" and "past resume
  // window, delete." Falls back to started_at for sessions with no
  // messages at all (which the empty branch deletes anyway).
  newest_at: string;
};

type RetrySession = { id: string; user_id: string };

async function findStaleSessions(): Promise<CandidateSession[]> {
  const admin = supabaseAdmin();
  const cutoff = new Date(
    Date.now() - STALE_IDLE_MINUTES * 60 * 1000,
  ).toISOString();

  // Pull open sessions first (no messages join needed). Filter to
  // those whose newest message is older than cutoff in JS, because
  // Supabase PostgREST doesn't compose aggregate filters cleanly.
  const { data: open, error: openErr } = await admin
    .from("sessions")
    .select("id, user_id, started_at")
    .is("ended_at", null)
    .lt("started_at", cutoff)
    .limit(SWEEP_BATCH_LIMIT);
  if (openErr) throw openErr;
  if (!open || open.length === 0) return [];

  const out: CandidateSession[] = [];
  for (const s of open) {
    const { data: newest, error: newestErr } = await admin
      .from("messages")
      .select("created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newestErr) throw newestErr;
    // Empty session older than cutoff counts as stale.
    const newestAt = newest?.created_at ?? s.started_at;
    if (new Date(newestAt) > new Date(cutoff)) continue;

    const { count, error: countErr } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id);
    if (countErr) throw countErr;
    const { count: userCount, error: userCountErr } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id)
      .eq("is_sent_by_ai", false);
    if (userCountErr) throw userCountErr;

    out.push({
      id: s.id,
      user_id: s.user_id,
      message_count: count ?? 0,
      user_message_count: userCount ?? 0,
      newest_at: newestAt,
    });
  }
  return out;
}

// Sessions that were ended (either by the user clicking End or by a
// prior sweep) but whose analysis never completed. Happens when
// runSessionEndAnalysis throws inside after() — the `catch` in
// src/app/sessions/actions.ts swallows the error so the serverless
// invocation doesn't crash, but the session is left with
// `(ended_at set, summary null)` and no retry path. This sweep picks
// them up and re-runs the RPC.
//
// Filters on is_substantive = true. The original implementation did
// NOT filter this, out of paranoia about a then-untraced bug where a
// 40-exchange session got wrongly tagged false and the cron silently
// skipped it. The cost of that paranoia was much larger: every
// abandoned 1-9-message test session got retried daily, every retry
// failed (the model can't produce a valid v7 session_end JSON for a
// transcript that small), and the cron's "failed" counter climbed
// to 44/45 in real prod data. With substantive=true we re-establish
// the right invariant: the retry path only handles sessions that
// SHOULD have produced an analysis but didn't. Short-session
// abandons stay in the "(too short for analysis)" bucket — surfaced
// in the UI as a brief-session label, not a stuck "Summary pending."
async function findEndedUnanalyzedSessions(): Promise<RetrySession[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("sessions")
    .select("id, user_id")
    .not("ended_at", "is", null)
    .is("summary", null)
    .eq("is_substantive", true)
    .limit(SWEEP_BATCH_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let stale: CandidateSession[];
  let retry: RetrySession[];
  try {
    [stale, retry] = await Promise.all([
      findStaleSessions(),
      findEndedUnanalyzedSessions(),
    ]);
  } catch (err) {
    captureSessionError(err, "cron_sweep_scan");
    throw err;
  }

  const admin = supabaseAdmin();
  const results = { closed: 0, deleted: 0, analyzed: 0, retried: 0, failed: 0 };

  for (const s of stale) {
    // Empty session — user started it but never typed. Delete the
    // row + its (single, AI-only) message rather than closing it,
    // so it doesn't clutter the Sessions tab as "Open session".
    if (s.user_message_count === 0) {
      const msgRes = await admin
        .from("messages")
        .delete()
        .eq("session_id", s.id);
      if (msgRes.error) {
        results.failed += 1;
        captureSessionError(msgRes.error, "cron_sweep_close", s.id);
        continue;
      }
      const sessRes = await admin
        .from("sessions")
        .delete()
        .eq("id", s.id);
      if (sessRes.error) {
        results.failed += 1;
        captureSessionError(sessRes.error, "cron_sweep_close", s.id);
        continue;
      }
      results.deleted += 1;
      continue;
    }

    const isSubstantive = s.message_count >= SUBSTANTIVE_MESSAGE_THRESHOLD;

    if (!isSubstantive) {
      // Sub-substantive: leave open if the user might still come
      // back, otherwise delete. The 24h window gives a tester who
      // closed the app mid-conversation a chance to resume rather
      // than losing their thread. Past 24h with no activity, the
      // session is effectively abandoned and there's no analysis
      // worth running on a sub-substantive transcript anyway.
      const idleMs = Date.now() - new Date(s.newest_at).getTime();
      if (idleMs < RESUME_WINDOW_MS) {
        // Skip — keep the session open for resume.
        continue;
      }
      // Past resume window — delete entirely.
      const msgRes = await admin
        .from("messages")
        .delete()
        .eq("session_id", s.id);
      if (msgRes.error) {
        results.failed += 1;
        captureSessionError(msgRes.error, "cron_sweep_close", s.id);
        continue;
      }
      const sessRes = await admin
        .from("sessions")
        .delete()
        .eq("id", s.id);
      if (sessRes.error) {
        results.failed += 1;
        captureSessionError(sessRes.error, "cron_sweep_close", s.id);
        continue;
      }
      results.deleted += 1;
      continue;
    }

    // Substantive: close + analyze. Same guard as the user
    // endSession path: no-op if already ended.
    const { error: closeErr } = await admin
      .from("sessions")
      .update({
        ended_at: new Date().toISOString(),
        is_substantive: true,
      })
      .eq("id", s.id)
      .is("ended_at", null);
    if (closeErr) {
      results.failed += 1;
      captureSessionError(closeErr, "cron_sweep_close", s.id);
      continue;
    }
    results.closed += 1;

    try {
      // Reuse the user-facing analysis helper; it invokes the RPC,
      // which under service_role ignores RLS. Using the same code
      // path means the end-state is identical whether an End click
      // or the cron triggered it.
      await runSessionEndAnalysis(
        { client: admin, userId: s.user_id },
        s.id,
      );
      results.analyzed += 1;
    } catch (err) {
      results.failed += 1;
      // runSessionEndAnalysis already captures on OpenAI / RPC
      // failures; this is a secondary capture with cron context.
      captureSessionError(err, "cron_sweep_analyze", s.id);
    }
  }

  // Retry pass: the RPC's `WHERE summary IS NULL` guard makes re-runs safe.
  for (const s of retry) {
    try {
      await runSessionEndAnalysis({ client: admin, userId: s.user_id }, s.id);
      results.retried += 1;
    } catch (err) {
      results.failed += 1;
      captureSessionError(err, "cron_sweep_retry_analyze", s.id);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: stale.length,
    retries: retry.length,
    ...results,
  });
}

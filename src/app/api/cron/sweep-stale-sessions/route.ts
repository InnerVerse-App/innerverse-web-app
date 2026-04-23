import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { runSessionEndAnalysis } from "@/lib/session-end";
import { SUBSTANTIVE_MESSAGE_THRESHOLD } from "@/lib/sessions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Abandoned-session sweep. Runs on Vercel Cron every 15 minutes
// (vercel.json) and manually via the dashboard "Run now" button.
// Finds sessions that were never ended and whose most recent message
// is at least STALE_IDLE_MINUTES old, closes them, and runs the
// gpt-5 analysis for any that crossed the substantive threshold.
//
// Auth: Vercel Cron adds an Authorization: Bearer <CRON_SECRET>
// header automatically when CRON_SECRET is set in env vars. The
// check below is both the auth for cron and the gate against
// external abuse. Manual testing: set the header from the Vercel
// dashboard's Run-now or curl with the secret.

const STALE_IDLE_MINUTES = 30;
const SWEEP_BATCH_LIMIT = 50;

type CandidateSession = {
  id: string;
  user_id: string;
  message_count: number;
};

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

    out.push({
      id: s.id,
      user_id: s.user_id,
      message_count: count ?? 0,
    });
  }
  return out;
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let stale: CandidateSession[];
  try {
    stale = await findStaleSessions();
  } catch (err) {
    Sentry.captureException(err, { tags: { stage: "cron_sweep_scan" } });
    throw err;
  }

  const admin = supabaseAdmin();
  const results = { closed: 0, analyzed: 0, failed: 0 };

  for (const s of stale) {
    const isSubstantive = s.message_count >= SUBSTANTIVE_MESSAGE_THRESHOLD;

    // Close the session under service_role. Same guard as the user
    // endSession path: no-op if already ended.
    const { error: closeErr } = await admin
      .from("sessions")
      .update({
        ended_at: new Date().toISOString(),
        is_substantive: isSubstantive,
      })
      .eq("id", s.id)
      .is("ended_at", null);
    if (closeErr) {
      results.failed += 1;
      Sentry.captureException(closeErr, {
        tags: { stage: "cron_sweep_close", session_id: s.id },
      });
      continue;
    }
    results.closed += 1;

    if (!isSubstantive) continue;

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
      Sentry.captureException(err, {
        tags: { stage: "cron_sweep_analyze", session_id: s.id },
      });
    }
  }

  return NextResponse.json({ ok: true, candidates: stale.length, ...results });
}

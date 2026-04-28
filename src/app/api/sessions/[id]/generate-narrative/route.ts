import { NextResponse } from "next/server";

import { runGrowthNarrativeUpdate } from "@/lib/growth-narrative";
import { captureSessionError } from "@/lib/observability";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// gpt-5 narrative call is shorter than the analyzer (smaller output,
// less reasoning) but still benefits from the full Hobby ceiling.
export const maxDuration = 60;

// Internal endpoint that runs the cumulative growth-narrative
// pipeline for one session. Triggered fire-and-forget from
// session-end's after() handler immediately after the analyzer
// finishes — that gives the narrative its own function-time budget
// (the analyzer's after() is already burning the original request's
// 60s ceiling).
//
// Auth: requires the same CRON_SECRET as the abandonment sweep.
// Same threat model — anyone with the secret can re-run the
// narrative for any session_id, which is bounded to writing
// coaching_state.growth_narrative for that user. Not a public
// endpoint; the trigger from session-end injects the secret from
// process.env.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: sessionRow, error: sessionErr } = await admin
    .from("sessions")
    .select("id, user_id, summary")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    captureSessionError(sessionErr, "growth_narrative_db_write", sessionId);
    return NextResponse.json(
      { error: "lookup_failed", message: sessionErr.message },
      { status: 500 },
    );
  }
  if (!sessionRow) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  // Skip when the analyzer hasn't written its summary yet — the
  // narrative depends on the analyzer's output.
  if (!sessionRow.summary) {
    return NextResponse.json(
      { ok: false, reason: "session_summary_pending" },
      { status: 202 },
    );
  }

  try {
    const ok = await runGrowthNarrativeUpdate(
      { client: admin, userId: sessionRow.user_id },
      sessionId,
    );
    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { captureSessionError } from "@/lib/observability";
import { runSessionEndAnalysis } from "@/lib/session-end";
import { supabaseForUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// v7 + 40-exchange transcripts can run close to the 60s OpenAI
// client timeout; the cron uses the same cap. Hobby tier maxes at
// 60s anyway, so this is the ceiling we have.
export const maxDuration = 60;

// Per-user recovery for stuck sessions. Visit this URL in a logged-in
// browser tab and any of your sessions where `ended_at IS NOT NULL
// AND summary IS NULL` will be force-analyzed — regardless of the
// `is_substantive` flag, which the daily cron's retry pass requires
// but which can be wrong if the close-session path mis-counted
// messages.
//
// This is deliberately user-scoped: it runs through `supabaseForUser`
// (RLS), so a user can only recover their own sessions. The bypass
// of `is_substantive` is intentional — if you ended a session with a
// real conversation, you almost certainly want the analysis run.
//
// GET so it can be triggered by visiting the URL in a browser. POST
// would force a curl-with-cookies dance; the operator-friendly
// version is just clicking a link.
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ctx = await supabaseForUser();
  if (!ctx) {
    return NextResponse.json({ error: "no_session_token" }, { status: 401 });
  }

  // Find the user's stuck sessions. RLS already restricts to their
  // own rows; the explicit user_id filter is belt-and-suspenders.
  const { data, error } = await ctx.client
    .from("sessions")
    .select("id, is_substantive")
    .eq("user_id", ctx.userId)
    .not("ended_at", "is", null)
    .is("summary", null);
  if (error) {
    captureSessionError(error, "session_end_rpc");
    return NextResponse.json(
      { error: "lookup_failed", message: error.message },
      { status: 500 },
    );
  }

  const candidates = data ?? [];
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, message: "no stuck sessions found", recovered: [] });
  }

  type Result = { id: string; status: "analyzed" | "failed"; error?: string };
  const results: Result[] = [];

  for (const s of candidates) {
    // Force-flip is_substantive if it was false — the cron's retry
    // pass filters on this, and we want future re-runs to find it
    // too. Safe: a session with `ended_at` set and a real transcript
    // is by definition worth analyzing.
    if (!s.is_substantive) {
      const { error: flipErr } = await ctx.client
        .from("sessions")
        .update({ is_substantive: true })
        .eq("id", s.id)
        .eq("user_id", ctx.userId);
      if (flipErr) {
        results.push({ id: s.id, status: "failed", error: `flip: ${flipErr.message}` });
        continue;
      }
    }

    try {
      await runSessionEndAnalysis(ctx, s.id);
      results.push({ id: s.id, status: "analyzed" });
    } catch (err) {
      // runSessionEndAnalysis already logs + captures; record the
      // result locally so the response is honest about what
      // succeeded.
      results.push({
        id: s.id,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, recovered: results });
}

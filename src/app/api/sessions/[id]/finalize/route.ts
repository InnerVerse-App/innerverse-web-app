import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { captureSessionError } from "@/lib/observability";
import {
  countMessages,
  deleteSession,
  hasUserMessages,
  SUBSTANTIVE_MESSAGE_THRESHOLD,
} from "@/lib/sessions";
import { supabaseForUser } from "@/lib/supabase";

export const runtime = "nodejs";

// Lightweight close-on-leave endpoint. Hit by navigator.sendBeacon()
// from ChatView when the browser fires `pagehide` — the user closed
// the tab, navigated to another domain, or otherwise unloaded the
// page. Sets ended_at + is_substantive on the session, idempotently.
//
// Deliberately does NOT run the v7 AI analysis. sendBeacon doesn't
// wait for a response, and a 30+ second OpenAI call is a poor fit
// for a request that the browser is actively tearing down. The
// existing daily cron at /api/cron/sweep-stale-sessions picks up
// any sessions where ended_at IS NOT NULL but summary IS NULL and
// runs the analysis there. The cron's RPC is idempotent so a race
// with a manual end-click is safe.
//
// Auth: relies on Clerk session cookies, which sendBeacon includes
// automatically. RLS on the UPDATE scopes to the caller's row;
// .eq("user_id", …) is belt-and-suspenders.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.userId) {
    // 204 even on auth failure — sendBeacon swallows the response
    // anyway, and we don't want to leak whether the session exists.
    return new NextResponse(null, { status: 204 });
  }

  const ctx = await supabaseForUser();
  if (!ctx) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const userTyped = await hasUserMessages(ctx, id);
    if (!userTyped) {
      // User closed the tab without ever typing a message. The
      // session is just the AI's opening — delete the row so it
      // doesn't clutter the Sessions tab.
      await deleteSession(ctx, id);
      return new NextResponse(null, { status: 204 });
    }
    const messageCount = await countMessages(ctx, id);
    const { error } = await ctx.client
      .from("sessions")
      .update({
        ended_at: new Date().toISOString(),
        is_substantive: messageCount >= SUBSTANTIVE_MESSAGE_THRESHOLD,
      })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .is("ended_at", null);
    // Already-ended is not an error: 0 rows affected just means
    // the user manually clicked End or another tab raced this one.
    if (error) {
      captureSessionError(error, "session_finalize_beacon", id);
    }
  } catch (err) {
    captureSessionError(err, "session_finalize_beacon", id);
  }

  return new NextResponse(null, { status: 204 });
}

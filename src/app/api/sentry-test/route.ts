import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Smoke-test endpoint for verifying Sentry is wired end-to-end.
// Gated by ENABLE_SENTRY_TEST_ROUTE=1 so it's 404 in normal operation.
// Flip the env var in Vercel to verify a new environment, hit the route,
// confirm the event appears in Sentry, then turn it back off.
//
// Outside the Clerk middleware matcher (src/middleware.ts) so the
// operator can hit it with plain curl — no session needed.

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.ENABLE_SENTRY_TEST_ROUTE !== "1") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const eventId = Sentry.captureMessage(
    `sentry-test: smoke event at ${new Date().toISOString()}`,
    "info",
  );
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    eventId,
    dsnConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  });
}

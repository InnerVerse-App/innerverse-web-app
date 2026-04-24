import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

// CONVENTION for new public (no-Clerk-session) routes: put them under
// `/api/public/*`. The matcher below already excludes that whole
// prefix, so you do NOT need to edit this file to add one. The three
// legacy named exclusions (api/healthcheck, api/clerk-webhook,
// api/sentry-test) predate the convention and are grandfathered in
// place — moving them would break external integrations (Clerk
// dashboard webhook URL, uptime monitors, etc.).
//
// Reasoning: clerkMiddleware() without `auth.protect()` only attaches
// session context, so a forgotten exclusion wouldn't 401 — it would
// silently run the Clerk attach on every request (~10-50ms + Clerk
// quota). Still worth avoiding. Adopting a single prefix means future
// routes are correctly classified by their path, not by a separate
// regex amendment that's easy to forget.
//
// The Clerk webhook endpoint is signed by Clerk with svix; signature
// verification is its auth layer (NOT session state), so routing it
// through clerkMiddleware would be wrong. Sentry's browser tunnel
// (/monitoring, configured in next.config.ts tunnelRoute) has no
// Clerk session either.
//
// path-to-regexp only allows negative lookaheads at the start of a
// pattern, so all exclusions fold into this single matcher.
export const config = {
  matcher: [
    "/((?!_next|api/public|api/healthcheck|api/clerk-webhook|api/sentry-test|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

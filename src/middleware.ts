import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and the unauthenticated
    // healthcheck endpoint (Audit 2026-04-22 F10 — a Clerk outage must
    // not be able to make /api/healthcheck appear as a Supabase outage).
    // path-to-regexp only allows negative lookaheads at the start of a
    // pattern, so the API-catch-all rule is folded into this single
    // exclusion-based rule rather than added as a second matcher.
    "/((?!_next|api/healthcheck|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

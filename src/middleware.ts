import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and unauthenticated webhook /
    // healthcheck endpoints. The Clerk webhook endpoint is signed by Clerk
    // with svix; signature verification is its auth layer (NOT session
    // state), so routing it through clerkMiddleware would be wrong.
    // Healthcheck exclusion: see Audit 2026-04-22 F10.
    // path-to-regexp only allows negative lookaheads at the start of a
    // pattern, so exclusions are folded into this single matcher.
    "/((?!_next|api/healthcheck|api/clerk-webhook|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

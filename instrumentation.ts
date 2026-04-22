import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per runtime at boot. We forward to the
// runtime-specific Sentry config file so Node and Edge both initialize.
// The client runtime is bootstrapped separately by Sentry via
// sentry.client.config.ts (injected at build time by withSentryConfig).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forward nested React Server Component errors to Sentry. Next.js wraps
// RSC errors in a generic "server error" by default; this hook gives us
// the original exception.
export const onRequestError = Sentry.captureRequestError;

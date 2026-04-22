import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig injects Sentry's webpack plugin (source-map upload,
// tree-shaking of debug logger) and wires up the client-config bootstrap.
// Without SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN env vars the
// upload step silently no-ops, so local builds work without credentials.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Tunnel browser Sentry traffic through a same-origin route so ad
  // blockers don't strip error events. Default-safe.
  tunnelRoute: "/monitoring",
});

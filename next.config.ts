import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Several server modules read prompt files from reference/ at
  // runtime via fs.readFileSync (the opener, master coaching prompt,
  // session-end analyzer, response parser, and growth-narrative
  // pipeline). Next.js's bundler only tracks static imports, so the
  // .md files need to be explicitly included in the serverless
  // function bundle or production reads ENOENT. The glob covers all
  // prompt-*.md variants at the top level — archived/superseded
  // prompts under reference/archive/ are intentionally NOT bundled.
  outputFileTracingIncludes: {
    "/**/*": ["./reference/prompt-*.md"],
  },
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

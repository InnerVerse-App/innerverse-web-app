import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Several server modules read prompt + welcome files from
  // reference/ at runtime via fs.readFileSync (the opener, master
  // coaching prompt, session-end analyzer, response parser,
  // growth-narrative pipeline, and the first-session coach welcome
  // loader). Next.js's bundler only tracks static imports, so the
  // .md files need to be explicitly included in the serverless
  // function bundle or production reads ENOENT.
  //
  // Why two patterns instead of `./reference/*.md`:
  //   - The prompt-*.md glob covers every prompt variant including
  //     future model-renamed ones, AND excludes the archived prompts
  //     under reference/archive/ which we don't want at runtime.
  //   - coach_welcome_messages.md doesn't fit the prompt-* prefix, so
  //     it's listed explicitly. Anything else added to reference/
  //     that's read by server code at runtime needs the same
  //     treatment — add it here.
  outputFileTracingIncludes: {
    "/**/*": [
      "./reference/prompt-*.md",
      "./reference/coach_welcome_messages.md",
    ],
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

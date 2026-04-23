import "server-only";

import * as Sentry from "@sentry/nextjs";

// All session-lifecycle errors (session-start OpenAI, session-end
// OpenAI, session-end RPC, feedback insert, cron analysis, stream
// failure, etc.) share the same tag shape so Sentry filters stay
// tidy. Use this helper at every capture site under
// src/app/sessions, src/lib/session-end, and the cron sweep route.
export function captureSessionError(
  err: unknown,
  stage: string,
  sessionId?: string,
): void {
  const tags: Record<string, string> = { stage };
  if (sessionId) tags.session_id = sessionId;
  Sentry.captureException(err, { tags });
}

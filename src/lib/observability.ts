import "server-only";

import * as Sentry from "@sentry/nextjs";

// All session-lifecycle errors (session-start OpenAI, session-end
// OpenAI, session-end RPC, feedback insert, cron analysis, stream
// failure, etc.) share the same tag shape so Sentry filters stay
// tidy. Use this helper at every capture site under
// src/app/sessions, src/lib/session-end, and the cron sweep route.
export type SessionErrorStage =
  | "session_start_openai"
  | "session_chat_stream"
  | "session_chat_empty_response"
  | "session_chat_no_response_id"
  | "session_end_openai"
  | "session_end_truncated"
  | "session_end_refusal"
  | "session_end_rpc"
  | "session_feedback_insert"
  | "cron_sweep_scan"
  | "cron_sweep_close"
  | "cron_sweep_analyze"
  | "cron_sweep_retry_analyze";

export function captureSessionError(
  err: unknown,
  stage: SessionErrorStage,
  sessionId?: string,
): void {
  const tags: Record<string, string> = { stage };
  if (sessionId) tags.session_id = sessionId;
  Sentry.captureException(err, { tags });
}

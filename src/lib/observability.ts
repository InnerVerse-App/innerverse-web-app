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
  | "session_response_save"
  | "session_response_openai"
  | "session_response_truncated"
  | "session_response_refusal"
  | "session_response_rpc"
  | "session_finalize_beacon"
  | "cron_sweep_scan"
  | "cron_sweep_close"
  | "cron_sweep_analyze"
  | "cron_sweep_retry_analyze"
  | "growth_narrative_openai"
  | "growth_narrative_truncated"
  | "growth_narrative_refusal"
  | "growth_narrative_db_write"
  | "style_calibration_openai"
  | "style_calibration_truncated"
  | "style_calibration_refusal"
  | "style_calibration_shape"
  | "style_calibration_db_write";

export function captureSessionError(
  err: unknown,
  stage: SessionErrorStage,
  sessionId?: string,
): void {
  const tags: Record<string, string> = { stage };
  if (sessionId) tags.session_id = sessionId;
  Sentry.captureException(err, { tags });
}

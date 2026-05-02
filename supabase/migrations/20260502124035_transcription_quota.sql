-- Transcription quota — Phase 1 of audit FINDING 1 (HIGH).
--
-- Adds two columns to public.coaching_state for tracking daily
-- Whisper transcription calls per user. Used by /api/journal/transcribe
-- and /api/sessions/[id]/transcribe to reject calls beyond the cap
-- (default 200/day) with a 429 response.
--
-- Why on coaching_state and not a dedicated table:
--   - coaching_state is already the user-level state row, populated
--     by ensureCoachingState in lib/sessions.ts. The transcribe
--     routes already touch this row indirectly via the user.
--   - A dedicated table would add more migration / RLS / cascade
--     surface for two scalar values that are functionally just a
--     daily counter.
--
-- Why a date column instead of a TTL: lets us tell whether the
-- counter applies to today vs needs reset, without scheduled jobs.
-- The reset logic lives in the application layer (helper in
-- lib/voice.ts).

alter table public.coaching_state
  add column if not exists transcription_count_today int not null default 0,
  add column if not exists transcription_count_date date;

-- No new index — coaching_state primary key (user_id) already covers
-- the only lookup pattern we use.

-- ---------------------------------------------------------------
-- DOWN (rollback) — copy into a new ad-hoc SQL file to apply.
-- alter table public.coaching_state drop column if exists transcription_count_date;
-- alter table public.coaching_state drop column if exists transcription_count_today;

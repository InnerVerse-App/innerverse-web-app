-- Reshape onboarding_selections to match the legacy "Account Setup"
-- data model and the 6-step onboarding UI.
--
-- Drops:
--   - ai_persona: derived from coach_name at session-prompt-assembly
--     time; not an onboarding field.
--   - style_calibration: filled in at runtime from session feedback;
--     not an onboarding field.
--   - goals: replaced by top_goals (clearer name; no data exists yet).
--
-- Adds (one column per onboarding step that captures structured data):
--   - why_are_you_here: step 1 broad-theme tags (multi-select).
--   - top_goals: step 2 specific-goal tags (multi-select).
--   - top_goals_input: step 2 free-text "not seeing what you're
--     looking for" textarea.
--   - satisfaction_ratings: step 3 six 1–5 sliders, stored as jsonb
--     for forward flexibility (categories may grow).
--   - coach_notes: step 4 optional 500-char free text for the coach.
--   - completed_at: set when the user finishes step 6; null while
--     in-progress. Drives the "send to onboarding" gate in the app.
--
-- Steps 5 (coaching_style) and 6 (coach_name) already had columns.
--
-- Idempotency: ALTER TABLE blocks use IF EXISTS / IF NOT EXISTS so
-- the migration can be re-applied safely.

alter table public.onboarding_selections
  drop column if exists ai_persona,
  drop column if exists style_calibration,
  drop column if exists goals,
  add column if not exists why_are_you_here text[] not null default '{}',
  add column if not exists top_goals text[] not null default '{}',
  add column if not exists top_goals_input text,
  add column if not exists satisfaction_ratings jsonb,
  add column if not exists coach_notes text,
  add column if not exists completed_at timestamptz;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- alter table public.onboarding_selections
--   drop column if exists completed_at,
--   drop column if exists coach_notes,
--   drop column if exists satisfaction_ratings,
--   drop column if exists top_goals_input,
--   drop column if exists top_goals,
--   drop column if exists why_are_you_here,
--   add column if not exists goals text[],
--   add column if not exists style_calibration text,
--   add column if not exists ai_persona text;

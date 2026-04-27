-- V.7 schema additions — score rationales + per-theme disagreement.
--
-- Three additive changes (no breaking shape):
--
-- 1. sessions.score_rationales jsonb — parallel to the four
--    existing sub-scores (self_disclosure / cognitive_shift /
--    emotional_integration / novelty), one short justification per
--    score. The v7 prompt requires this, but old sessions and
--    forward-compat callers may leave it null.
--
-- 2. session_themes.score_rationale text — the v7 prompt requires
--    a written rationale citing transcript content for any theme
--    rated 4+. Stored next to the existing intensity column.
--
-- 3. session_themes.user_disagreed_at timestamptz +
--    user_disagreement_note text — Call 2 (response-parser v2) can
--    now flag a theme as user-rejected. Mirrors the same columns
--    that already exist on insights / breakthroughs since v5a.
--
-- Idempotent: every column uses `add column if not exists` so
-- re-running the migration on dev or rolling forward across
-- mid-stream environments is safe.

alter table public.sessions
  add column if not exists score_rationales jsonb;

alter table public.session_themes
  add column if not exists score_rationale text,
  add column if not exists user_disagreed_at timestamptz,
  add column if not exists user_disagreement_note text;

comment on column public.sessions.score_rationales is
  'V.7: jsonb object with 1-sentence justifications for each of the 4 sub-scores. Keys: self_disclosure, cognitive_shift, emotional_integration, novelty.';
comment on column public.session_themes.score_rationale is
  'V.7: 1-sentence justification for the theme intensity, citing transcript content. Required by the v7 prompt for intensity >=4.';
comment on column public.session_themes.user_disagreed_at is
  'V.7: timestamp set by Call 2 when the client rejects this theme framing in their post-session reflection.';
comment on column public.session_themes.user_disagreement_note is
  'V.7: short paraphrase of the client''s rejection. Stored alongside user_disagreed_at.';

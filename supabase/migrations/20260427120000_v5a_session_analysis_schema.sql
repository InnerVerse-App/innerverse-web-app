-- =================================================================
-- V.5a — Session analysis: evidence-required shifts and breakthroughs,
-- per-session crumb trail, per-user theme vocabulary, coach narrative,
-- and the user-disagrees-with-AI calibration loop.
-- =================================================================
-- Up to this point the AI emits shifts and breakthroughs as flat text
-- strings. The constellation map then has to *guess* which sessions
-- led to which shift / breakthrough. This migration replaces that
-- with an explicit evidence trail: every shift/breakthrough/goal
-- carries the contributor IDs the AI claimed, an evidence quote from
-- the transcript, and per-contributor influence scores. The shift
-- and breakthrough emissions are also gated by the rubric defined in
-- prompt-session-end-v6: each session gets sub-scores (0–10), each
-- emitted claim must cite the moment that justifies it, and the
-- user can reject any claim via the post-session narrative — which
-- writes a disagreement-flag here so the visual demotes the star.
--
-- Themes are per-user. The first session invents them; later sessions
-- reuse from the user's existing vocabulary unless a genuinely new
-- pattern emerges. session_themes is the crumb trail: per (session,
-- theme) intensity (0–10) plus direction (forward / stuck /
-- regression), so the analysis surface is honest about backsliding,
-- not just forward motion.

-- ---------------------------------------------------------------
-- 1. themes — per-user vocabulary
-- ---------------------------------------------------------------
-- Lowercase-unique within a user so "Boundaries" and "boundaries"
-- don't end up as two separate rows. Each theme carries a one-line
-- description the AI sets when first inventing the theme; later
-- analyses see this and stay consistent in how they use the label.

create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  label text not null,
  description text,
  first_seen_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create unique index if not exists themes_user_label_unique
  on public.themes (user_id, lower(label));
create index if not exists themes_user_last_used_idx
  on public.themes (user_id, last_used_at desc);

-- ---------------------------------------------------------------
-- 2. session_themes — the crumb trail per session
-- ---------------------------------------------------------------
-- One row per (session, theme). intensity is the 0–10 score
-- (1–6 = building, 7–8 = shift band, 9–10 = breakthrough band, but
-- the actual shift/breakthrough emissions live on the insights /
-- breakthroughs tables — this row is just the per-session signal
-- that the matcher uses to associate sessions with later shifts).
-- direction lets the visual surface regression honestly. evidence_
-- quote is required for intensity > 6 (enforced in the prompt, not
-- the schema).

create table if not exists public.session_themes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  theme_id uuid not null references public.themes(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  intensity smallint not null check (intensity between 0 and 10),
  direction text not null check (direction in ('forward', 'stuck', 'regression')),
  evidence_quote text,
  -- When this session's work on this theme directly maps to a
  -- predefined goal, link it. Used by the goals tab to roll up
  -- session-level contributions to goal progress.
  linked_goal_id uuid references public.goals(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, theme_id)
);

create index if not exists session_themes_session_idx
  on public.session_themes (session_id);
create index if not exists session_themes_user_intensity_idx
  on public.session_themes (user_id, intensity desc);
create index if not exists session_themes_theme_idx
  on public.session_themes (theme_id);

-- ---------------------------------------------------------------
-- 3. sessions additions — sub-scores + coach narrative + user response
-- ---------------------------------------------------------------
-- Sub-scores feed the shift/breakthrough rubric. The combined
-- categorical decision (no claim / shift / breakthrough) lives on
-- the insights / breakthroughs tables, but the per-dimension scores
-- give us calibration data for tuning the rubric over time.
--
-- coach_message stays as the short cross-session memory hook.
-- coach_narrative is the longer, multi-paragraph summary the user
-- reads after the session — generated in the same analysis call,
-- streamed to the post-session UI.
--
-- user_response_text is the free-text reply from the post-session
-- form. response_parsed_at is set by Call 2 (the response-parser)
-- once any adjustments derived from the response have been applied
-- back to the underlying claims.

alter table public.sessions
  add column if not exists self_disclosure_score smallint
    check (self_disclosure_score between 0 and 10),
  add column if not exists cognitive_shift_score smallint
    check (cognitive_shift_score between 0 and 10),
  add column if not exists emotional_integration_score smallint
    check (emotional_integration_score between 0 and 10),
  add column if not exists novelty_score smallint
    check (novelty_score between 0 and 10),
  add column if not exists coach_narrative text,
  add column if not exists narrative_reflection_prompt text,
  add column if not exists user_response_text text,
  add column if not exists user_responded_at timestamptz,
  add column if not exists response_parsed_at timestamptz;

-- ---------------------------------------------------------------
-- 4. insights (mindset shifts) — evidence trail
-- ---------------------------------------------------------------
-- contributing_session_ids: the prior sessions the AI claims fed
-- this shift. Required to be non-empty when the AI emits a shift
-- (enforced by the prompt; schema allows empty arrays for the
-- bootstrap case where a shift is observed in the very first
-- session).
--
-- influence_scores: jsonb mapping session_id → 0..100 — lets the
-- constellation map rank the most-impactful contributors instead
-- of treating all contributors equally.
--
-- combined_score: the AI's 0–10 rating for this shift. 7–8 is the
-- shift band; below that it shouldn't have been emitted.
--
-- user_disagreed_at + user_disagreement_note: written by Call 2
-- when the user rejects this shift in their post-session response.
-- The constellation map demotes the star (no longer renders as a
-- shift) but the row stays for audit.

alter table public.insights
  add column if not exists contributing_session_ids uuid[] not null default '{}',
  add column if not exists evidence_quote text,
  add column if not exists influence_scores jsonb not null default '{}'::jsonb,
  add column if not exists combined_score smallint
    check (combined_score between 0 and 10),
  add column if not exists linked_theme_id uuid references public.themes(id) on delete set null,
  add column if not exists user_disagreed_at timestamptz,
  add column if not exists user_disagreement_note text;

create index if not exists insights_contributing_session_ids_gin
  on public.insights using gin (contributing_session_ids);
create index if not exists insights_linked_theme_idx
  on public.insights (linked_theme_id);

-- ---------------------------------------------------------------
-- 5. breakthroughs — direct vs via-shift contributors + audit
-- ---------------------------------------------------------------
-- direct_session_ids: sessions that fed this breakthrough WITHOUT
-- routing through a shift first. The constellation map draws lines
-- breakthrough → direct_session for these.
--
-- contributing_shift_ids: shifts that culminated in this break-
-- through. Drawn as breakthrough → shift, with the shift then
-- having its own lines to its contributing sessions.
--
-- contributing_session_ids: the full transitive closure — every
-- session that fed this breakthrough whether directly or via a
-- shift. Defines galaxy membership for the constellation.
--
-- galaxy_name is operator-renameable on the existing star map UI.
-- Default empty so the UI can fall back to deriving from content.

alter table public.breakthroughs
  add column if not exists direct_session_ids uuid[] not null default '{}',
  add column if not exists contributing_shift_ids uuid[] not null default '{}',
  add column if not exists contributing_session_ids uuid[] not null default '{}',
  add column if not exists evidence_quote text,
  add column if not exists influence_scores jsonb not null default '{}'::jsonb,
  add column if not exists combined_score smallint
    check (combined_score between 0 and 10),
  add column if not exists linked_theme_id uuid references public.themes(id) on delete set null,
  add column if not exists user_disagreed_at timestamptz,
  add column if not exists user_disagreement_note text,
  add column if not exists galaxy_name text not null default '';

create index if not exists breakthroughs_direct_session_ids_gin
  on public.breakthroughs using gin (direct_session_ids);
create index if not exists breakthroughs_contributing_shift_ids_gin
  on public.breakthroughs using gin (contributing_shift_ids);
create index if not exists breakthroughs_contributing_session_ids_gin
  on public.breakthroughs using gin (contributing_session_ids);
create index if not exists breakthroughs_linked_theme_idx
  on public.breakthroughs (linked_theme_id);

-- ---------------------------------------------------------------
-- 6. goals — contributors + completion lifecycle
-- ---------------------------------------------------------------
-- The contributor arrays let the goals tab show "this goal has been
-- shaped by N sessions, M shifts, K breakthroughs" with traceable
-- evidence rather than just a percentage.
--
-- completed_at is set after the AI detects 100% AND the user
-- confirms via the post-session flow ("looks like you've completed
-- '<title>'. Does it feel done?"). archived_at is set when the user
-- opts to remove it from the active list. Either can be cleared if
-- the user chooses "Bring it back" later.
--
-- completion_type splits "milestone" goals (definite finish line —
-- progress_percent + ring + gradient bar) from "practice" goals
-- (ongoing — recency bar). Defaults to milestone because that
-- matches how the predefined onboarding goals work today; custom
-- user-added goals can be either.

-- archived_at already exists from the goals_table migration
-- (PR #78 added the goal-archive feature). The other columns are
-- new in V.5a. `add column if not exists` makes this idempotent.
alter table public.goals
  add column if not exists contributing_session_ids uuid[] not null default '{}',
  add column if not exists contributing_shift_ids uuid[] not null default '{}',
  add column if not exists contributing_breakthrough_ids uuid[] not null default '{}',
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists completion_type text not null default 'milestone'
    check (completion_type in ('milestone', 'practice'));

create index if not exists goals_contributing_session_ids_gin
  on public.goals using gin (contributing_session_ids);
create index if not exists goals_contributing_shift_ids_gin
  on public.goals using gin (contributing_shift_ids);
create index if not exists goals_contributing_breakthrough_ids_gin
  on public.goals using gin (contributing_breakthrough_ids);
create index if not exists goals_completed_at_idx
  on public.goals (user_id, completed_at desc) where completed_at is not null;
create index if not exists goals_archived_at_idx
  on public.goals (user_id, archived_at desc) where archived_at is not null;

-- ---------------------------------------------------------------
-- Grants + RLS for the two new tables. Existing tables already have
-- RLS on; the alter-add-column statements inherit the parent's
-- policies, so no policy changes are needed for sessions / insights
-- / breakthroughs / goals.
-- ---------------------------------------------------------------

grant select, insert, update, delete on table public.themes to authenticated;
grant select, insert, update, delete on table public.session_themes to authenticated;

alter table public.themes enable row level security;
alter table public.themes force row level security;

alter table public.session_themes enable row level security;
alter table public.session_themes force row level security;

drop policy if exists "themes_select_own" on public.themes;
create policy "themes_select_own"
  on public.themes for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));
drop policy if exists "themes_insert_own" on public.themes;
create policy "themes_insert_own"
  on public.themes for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));
drop policy if exists "themes_update_own" on public.themes;
create policy "themes_update_own"
  on public.themes for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "session_themes_select_own" on public.session_themes;
create policy "session_themes_select_own"
  on public.session_themes for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));
drop policy if exists "session_themes_insert_own" on public.session_themes;
create policy "session_themes_insert_own"
  on public.session_themes for insert to authenticated
  with check (
    user_id = (auth.jwt() ->> 'sub')
    and exists (
      select 1 from public.sessions s
      where s.id = session_themes.session_id
        and s.user_id = (auth.jwt() ->> 'sub')
    )
  );
drop policy if exists "session_themes_update_own" on public.session_themes;
create policy "session_themes_update_own"
  on public.session_themes for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

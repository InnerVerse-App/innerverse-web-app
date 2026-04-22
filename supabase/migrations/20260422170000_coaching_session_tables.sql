-- Coaching-session tables for InnerVerse (Phase 6 Chunk 6.1).
--
-- Seven user-owned tables that back the coaching session loop:
--
--   - sessions: one row per coaching session. Created at session-start
--     (started_at only); session-end fills in summary + analysis columns
--     from the `prompt-session-end-v3.md` JSON.
--   - messages: chat transcript. Append-only. `is_sent_by_ai` distinguishes
--     user turns from assistant turns. `ai_response_id` stores the OpenAI
--     /v1/responses id so subsequent turns can chain via
--     `previous_response_id` (server-side conversation state, matches
--     Bubble behaviour).
--   - breakthroughs / insights / next_steps: flat string rows emitted by
--     session-end JSON (`breakthroughs[]`, `mindset_shifts[]`,
--     `recommended_next_steps[]`). v1 stores one row per string to match
--     the current prompt-v3 shape exactly. "insights" is named for UI
--     parity with the Bubble Insight data type; the JSON key
--     `mindset_shifts` is mapped at write time.
--   - session_feedback: post-session reflection + 1–5 sliders from the
--     Session Complete screen. All fields nullable so "Skip for now"
--     can produce a row or no row (application choice).
--   - coaching_state: single row per user holding the runtime mutables
--     that session-end updates — the three style_calibration floats
--     (directness, warmth, challenge) and recent_style_feedback. Seeded
--     lazily on first session-start (no existing users in prod).
--
-- Scope note: Phase 6 is coaching-session only (Tier 1). Goals, Progress,
-- and Home-tab reads (Tier 2) are not part of this migration. No
-- `goals` table here — onboarding_selections.top_goals is the only
-- goals surface until a later phase wires the Goals tab.
--
-- Consequence: several Bubble fields visible in reference/screenshots/
-- data-types/ are intentionally NOT carried over in Phase 6. The 6.3
-- parser ignores the unpersisted JSON keys. A future phase that
-- introduces a mutable goals table will pick them up. Dropped fields:
--   - session-end JSON: updated_goals[] (needs mutable goals table)
--   - Bubble Breakthrough: related_goal FK, percentage, subtext, note
--     (needs goals table + richer LLM output format)
--   - Bubble Insight: percentage, title (needs richer LLM output format)
--   - Bubble Goal (entire type): status, progress, progress_rationale,
--     suggested_next_step, last_session, is_archived, is_predefined
--     (entire Goals tab is Tier 2, not in Phase 6 scope)
--
-- Authentication model: same as identity_tables — Clerk JWT via Supabase
-- third-party-auth. RLS keys off auth.jwt()->>'sub'. FORCE row level
-- security on every table (Audit F17).
--
-- Delete policy: no DELETE policies on any table. User-initiated
-- deletion cascades from users.id via ON DELETE CASCADE (user.deleted
-- webhook path). This matches identity_tables' posture.
--
-- Idempotency: every CREATE / DROP uses IF NOT EXISTS / IF EXISTS.
--
-- Atomic session-end write: the multi-table write from session-end JSON
-- lives in a Postgres function shipped in Chunk 6.3. This migration only
-- creates the target tables and policies.

-- ---------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------
-- pgcrypto provides gen_random_uuid(). Supabase projects pre-create
-- the extension in the `extensions` schema by default; the
-- `create extension if not exists` here makes the migration
-- self-contained so it also works against a fresh Postgres with no
-- Supabase preamble applied.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Table: sessions
-- ---------------------------------------------------------------
-- Columns map to prompt-session-end-v3.md JSON fields:
--   summary                        <- session_summary
--   progress_summary_short         <- progress_summary_short
--   progress_percent               <- progress_percent (0–100)
--   language_patterns_observed     <- language_patterns_observed[]
--   nervous_system_markers         <- nervous_system_markers
--   trauma_protocol_triggered      <- trauma_protocol_triggered
--   reflection_mode_recommendation <- reflection_mode_recommendation
--   tone_feedback_recommendation   <- tone_feedback_recommendation
--   tool_glossary_suggestions      <- tool_glossary_suggestions[]
--
-- is_substantive is server-side (not in JSON): session-end code sets
-- it based on a message-count threshold and may skip analysis when
-- false. Nullable until session-end runs.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_substantive boolean,
  summary text,
  progress_summary_short text,
  progress_percent smallint check (progress_percent between 0 and 100),
  language_patterns_observed text[] not null default '{}',
  nervous_system_markers text,
  trauma_protocol_triggered boolean,
  reflection_mode_recommendation text,
  tone_feedback_recommendation text,
  tool_glossary_suggestions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_started_idx
  on public.sessions (user_id, started_at desc);

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: messages
-- ---------------------------------------------------------------
-- Append-only. No updated_at trigger. user_id is denormalized from
-- sessions.user_id so RLS can key off auth.jwt()->>'sub' directly
-- without a join, and so deletes cascade from users without traversing
-- sessions.
--
-- ai_response_id: OpenAI /v1/responses returns an id; passing it as
-- previous_response_id on the next turn keeps conversation state
-- server-side (cheaper than resending full history, and matches the
-- Bubble app's AI-response-ID column).

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  is_sent_by_ai boolean not null,
  content text not null,
  ai_response_id text,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_created_idx
  on public.messages (session_id, created_at);

-- ---------------------------------------------------------------
-- Tables: breakthroughs, insights, next_steps
-- ---------------------------------------------------------------
-- Parallel shape. One row per emitted string from session-end JSON.
-- Indexed (user_id, created_at desc) because the common query is
-- "recent N for this user" to feed cross-session memory and the
-- Progress tab (Tier 2, later phase).

create table if not exists public.breakthroughs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists breakthroughs_user_created_idx
  on public.breakthroughs (user_id, created_at desc);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists insights_user_created_idx
  on public.insights (user_id, created_at desc);

create table if not exists public.next_steps (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists next_steps_user_created_idx
  on public.next_steps (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Table: session_feedback
-- ---------------------------------------------------------------
-- Written only when the user submits the Session Complete form.
-- "Skip for now" produces no row. Three 1–5 sliders + two free-text
-- fields. Columns nullable because partial submissions are allowed
-- (the UI wires them all together, but schema-level constraints
-- shouldn't assume that).
--
-- UNIQUE (session_id): UI Submit is one-shot, so at most one feedback
-- row per session. Enforced at the schema layer rather than relying on
-- application discipline.
--
-- CHECK feedback_has_content: a row must carry at least one user-
-- supplied value. The "Skip for now" UI path produces no row at all;
-- an all-null row would indicate an application-layer bug (e.g., 6.3
-- accidentally inserting on the Skip path).

create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  reflection text,
  supportive_rating smallint check (supportive_rating between 1 and 5),
  helpful_rating smallint check (helpful_rating between 1 and 5),
  aligned_rating smallint check (aligned_rating between 1 and 5),
  additional_feedback text,
  created_at timestamptz not null default now(),
  constraint session_feedback_has_content check (
    reflection is not null
    or supportive_rating is not null
    or helpful_rating is not null
    or aligned_rating is not null
    or additional_feedback is not null
  )
);

create index if not exists session_feedback_user_created_idx
  on public.session_feedback (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Table: coaching_state
-- ---------------------------------------------------------------
-- One row per user. Holds runtime mutables that session-end updates:
--   - style_calibration (directness, warmth, challenge): three floats
--     on an intended -1..+1 semantic scale. Nudged by
--     style_calibration_delta from the session-end JSON (prompt-v3
--     clamps deltas to ±0.1). Running values are clamped to ±1.0 in
--     application code. No CHECK at schema level so clamp logic can
--     evolve without a migration. Columns map into prompt assembly
--     at session-start (src/lib/coaching-prompt.ts, Chunk 6.2).
--       directness: low = subtle / inviting, high = direct / confronting
--       warmth:     low = neutral / reserved, high = warm / affectionate
--       challenge:  low = gentle / validating, high = challenging / stretching
--   - recent_style_feedback: most recent free-text signal from
--     session_feedback.additional_feedback, surfaced back into the
--     next session's prompt assembly.
--
-- Seeded lazily by the session-start API on first use (no prod users
-- exist yet, so no backfill needed).

create table if not exists public.coaching_state (
  user_id text primary key references public.users(id) on delete cascade,
  directness double precision not null default 0,
  warmth double precision not null default 0,
  challenge double precision not null default 0,
  recent_style_feedback text,
  updated_at timestamptz not null default now()
);

drop trigger if exists coaching_state_set_updated_at on public.coaching_state;
create trigger coaching_state_set_updated_at
  before update on public.coaching_state
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
-- Matches the identity_tables pattern: authenticated role gets full
-- CRUD; RLS decides which rows. anon / public intentionally ungranted.

grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.breakthroughs to authenticated;
grant select, insert, update, delete on table public.insights to authenticated;
grant select, insert, update, delete on table public.next_steps to authenticated;
grant select, insert, update, delete on table public.session_feedback to authenticated;
grant select, insert, update, delete on table public.coaching_state to authenticated;

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------
-- FORCE RLS on every table (Audit F17). Owner-bypass is off.
--
-- All policies key off `auth.jwt()->>'sub'`, which by convention on
-- this project carries the Clerk user ID (matches the `text`
-- public.users(id) column). Configured in the Clerk dashboard's
-- Supabase JWT template. If that template is ever reconfigured to
-- use a different claim, every policy here silently fails closed —
-- see 20260422062124_identity_tables.sql and src/lib/supabase.ts.

alter table public.sessions enable row level security;
alter table public.sessions force row level security;

alter table public.messages enable row level security;
alter table public.messages force row level security;

alter table public.breakthroughs enable row level security;
alter table public.breakthroughs force row level security;

alter table public.insights enable row level security;
alter table public.insights force row level security;

alter table public.next_steps enable row level security;
alter table public.next_steps force row level security;

alter table public.session_feedback enable row level security;
alter table public.session_feedback force row level security;

alter table public.coaching_state enable row level security;
alter table public.coaching_state force row level security;

-- Policies — SELECT/UPDATE scope rows by user_id = auth.jwt()->>'sub'.
-- INSERT on session-scoped child tables (messages, breakthroughs,
-- insights, next_steps, session_feedback) ALSO requires the target
-- session_id to belong to the caller. Without this, a malicious
-- authenticated caller could insert rows attached to another user's
-- session by passing a valid foreign session_id — the FK check only
-- verifies the row exists, not ownership. The subquery closes that
-- gap at the correct layer (RLS write-time enforcement). Sessions PK
-- lookup keeps the cost negligible.
--
-- No DELETE policies; deletion flows through the users cascade only.

-- sessions: user can create, read, update their own. Update used to
-- set ended_at + summary fields at session-end.
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions
  for update
  to authenticated
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- messages: select + insert only. Never updated by users.
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
  on public.messages
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and session_id in (
      select id from public.sessions where user_id = auth.jwt()->>'sub'
    )
  );

-- breakthroughs: select + insert. Written by session-end.
drop policy if exists "breakthroughs_select_own" on public.breakthroughs;
create policy "breakthroughs_select_own"
  on public.breakthroughs
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "breakthroughs_insert_own" on public.breakthroughs;
create policy "breakthroughs_insert_own"
  on public.breakthroughs
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and session_id in (
      select id from public.sessions where user_id = auth.jwt()->>'sub'
    )
  );

-- insights: select + insert.
drop policy if exists "insights_select_own" on public.insights;
create policy "insights_select_own"
  on public.insights
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "insights_insert_own" on public.insights;
create policy "insights_insert_own"
  on public.insights
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and session_id in (
      select id from public.sessions where user_id = auth.jwt()->>'sub'
    )
  );

-- next_steps: select + insert.
drop policy if exists "next_steps_select_own" on public.next_steps;
create policy "next_steps_select_own"
  on public.next_steps
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "next_steps_insert_own" on public.next_steps;
create policy "next_steps_insert_own"
  on public.next_steps
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and session_id in (
      select id from public.sessions where user_id = auth.jwt()->>'sub'
    )
  );

-- session_feedback: select + insert. No updates (Submit is one-shot).
drop policy if exists "session_feedback_select_own" on public.session_feedback;
create policy "session_feedback_select_own"
  on public.session_feedback
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "session_feedback_insert_own" on public.session_feedback;
create policy "session_feedback_insert_own"
  on public.session_feedback
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and session_id in (
      select id from public.sessions where user_id = auth.jwt()->>'sub'
    )
  );

-- coaching_state: select + insert + update. Upsert on first session,
-- updates thereafter.
drop policy if exists "coaching_state_select_own" on public.coaching_state;
create policy "coaching_state_select_own"
  on public.coaching_state
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "coaching_state_insert_own" on public.coaching_state;
create policy "coaching_state_insert_own"
  on public.coaching_state
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "coaching_state_update_own" on public.coaching_state;
create policy "coaching_state_update_own"
  on public.coaching_state
  for update
  to authenticated
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back, copy this block into a new ad-hoc SQL file and apply via the
-- Supabase dashboard SQL editor or `supabase db execute`.
--
-- drop policy if exists "coaching_state_update_own" on public.coaching_state;
-- drop policy if exists "coaching_state_insert_own" on public.coaching_state;
-- drop policy if exists "coaching_state_select_own" on public.coaching_state;
-- drop policy if exists "session_feedback_insert_own" on public.session_feedback;
-- drop policy if exists "session_feedback_select_own" on public.session_feedback;
-- drop policy if exists "next_steps_insert_own" on public.next_steps;
-- drop policy if exists "next_steps_select_own" on public.next_steps;
-- drop policy if exists "insights_insert_own" on public.insights;
-- drop policy if exists "insights_select_own" on public.insights;
-- drop policy if exists "breakthroughs_insert_own" on public.breakthroughs;
-- drop policy if exists "breakthroughs_select_own" on public.breakthroughs;
-- drop policy if exists "messages_insert_own" on public.messages;
-- drop policy if exists "messages_select_own" on public.messages;
-- drop policy if exists "sessions_update_own" on public.sessions;
-- drop policy if exists "sessions_insert_own" on public.sessions;
-- drop policy if exists "sessions_select_own" on public.sessions;
-- drop trigger if exists coaching_state_set_updated_at on public.coaching_state;
-- drop trigger if exists sessions_set_updated_at on public.sessions;
-- drop table if exists public.coaching_state;
-- drop table if exists public.session_feedback;
-- drop table if exists public.next_steps;
-- drop table if exists public.insights;
-- drop table if exists public.breakthroughs;
-- drop table if exists public.messages;
-- drop table if exists public.sessions;

-- Goals tab Phase 5 — Chunk G.1.
--
-- Creates public.goals (user-owned, archive-only — no DELETE policy)
-- and adds public.next_steps.goal_id (FK → goals(id) ON DELETE SET
-- NULL) so per-goal next-steps can be linked to a specific goal.
--
-- Status enum: 3 values (not_started, on_track, at_risk). No
-- 'achieved' state — most coaching goals are practices, not terminal
-- achievements (build_self_confidence, practice_mindfulness,
-- improve_communication, etc. don't have an end-state). Goals exit
-- the active list via archived_at, not via a status flip. Terminal
-- goals (find_romantic_partner, change_careers, start_a_business)
-- exit the same way — user-initiated archive when the milestone is
-- met, often surfaced in the LLM coach_message.
--
-- archived_at is timestamptz NULL (not is_archived boolean) so we
-- know WHEN a goal was archived, matching Bubble's archived_date
-- field on the Goal data type.
--
-- is_predefined boolean distinguishes seeded goals (from
-- onboarding_selections.top_goals values) from user-added goals
-- (created via /goals/new in chunk G.4). Used by the lazy seed in
-- chunk G.3 to detect already-seeded users via the unique partial
-- index on (user_id, title) WHERE is_predefined = true.
--
-- Seed: NO SQL backfill in this migration. The goalLabel mapping
-- lives in TypeScript (src/lib/onboarding-labels.ts) and embedding
-- the 25 GOAL_CATEGORIES values as a CASE statement in SQL would
-- drift the moment one is renamed in product. A lazy seed helper
-- ships in G.3 — runs on first /goals visit, idempotent on the
-- unique partial index added below.
--
-- Authentication / RLS: same pattern as identity_tables and
-- coaching_session_tables. RLS keys off auth.jwt()->>'sub' (Clerk
-- user ID via Supabase third-party auth). FORCE row level security
-- on; service_role bypasses RLS by design (no service-role writer
-- planned for this table beyond the user-deletion cascade, which
-- traverses the FK on user_id, not the table directly).
--
-- No DELETE policy: matches Bubble (only is_archived in the data
-- type) and matches the project pattern from identity_tables.sql
-- and coaching_session_tables.sql. User-initiated deletion goes
-- through the existing Clerk webhook → users cascade.
--
-- Idempotency: every CREATE / DROP uses IF [NOT] EXISTS / IF EXISTS.
-- CHECK constraints, indexes, triggers, and policies are all
-- existence-guarded so partial-failure recovery and re-application
-- are safe.

-- ---------------------------------------------------------------
-- Table: goals
-- ---------------------------------------------------------------

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'not_started',
  progress_percent smallint check (progress_percent between 0 and 100),
  progress_rationale text,
  last_session_id uuid references public.sessions(id) on delete set null,
  is_predefined boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CHECK on status, added via DO block so re-running the migration
-- after the column already exists doesn't fail on duplicate
-- constraint.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_status_check'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_status_check
      check (status in ('not_started', 'on_track', 'at_risk'));
  end if;
end $$;

-- Indexes
--   - goals_user_active_idx: partial index for the common "list this
--     user's non-archived goals, newest first" query the Goals tab
--     and Home Top Goal card both run.
--   - goals_user_created_idx: full index covering archived + active
--     for the future Archived view.
--   - goals_user_predefined_title_uniq: prevents the lazy seed from
--     creating duplicate predefined goals on a re-run; also blocks
--     a user from manually adding a goal whose title collides with
--     a seeded one (defensive against a race between concurrent
--     /goals/new and lazy-seed). The partial WHERE clause limits
--     the constraint to predefined seeds, so user-added goals can
--     freely collide with each other or with predefined titles.

create index if not exists goals_user_active_idx
  on public.goals (user_id, created_at desc)
  where archived_at is null;

create index if not exists goals_user_created_idx
  on public.goals (user_id, created_at desc);

create unique index if not exists goals_user_predefined_title_uniq
  on public.goals (user_id, title)
  where is_predefined = true;

-- updated_at trigger — reuses public.set_updated_at() from
-- identity_tables.sql.

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- next_steps.goal_id
-- ---------------------------------------------------------------
-- Nullable FK. Existing rows get NULL (general / unattributed); new
-- rows from G.2's session-end RPC update will populate goal_id when
-- the LLM emits a next-step inside an updated_goals[i] entry.
-- recommended_next_steps[] entries (the flat array, kept per the
-- hybrid model) continue to land with goal_id = NULL.
--
-- ON DELETE SET NULL: if a goal is ever permanently removed
-- (currently only via user-cascade — no DELETE policy on goals),
-- the next_steps rows that referenced it become general
-- (goal_id = NULL) rather than disappearing. Their content is
-- still useful history.

alter table public.next_steps
  add column if not exists goal_id uuid
    references public.goals(id) on delete set null;

create index if not exists next_steps_goal_idx
  on public.next_steps (goal_id)
  where goal_id is not null;

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
-- authenticated role gets SELECT / INSERT / UPDATE; no DELETE
-- (archive-only). RLS gates which rows. anon / public ungranted.

grant select, insert, update on table public.goals to authenticated;

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------

alter table public.goals enable row level security;
alter table public.goals force row level security;

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own"
  on public.goals
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own"
  on public.goals
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own"
  on public.goals
  for update
  to authenticated
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back, copy this block into a new ad-hoc SQL file and apply via
-- the Supabase dashboard SQL editor or `supabase db execute`.
--
-- Order matters: drop the FK column from next_steps before the
-- referenced table; drop policies before the table they're on.
--
-- alter table public.next_steps drop column if exists goal_id;
-- drop policy if exists "goals_update_own" on public.goals;
-- drop policy if exists "goals_insert_own" on public.goals;
-- drop policy if exists "goals_select_own" on public.goals;
-- drop trigger if exists goals_set_updated_at on public.goals;
-- drop index if exists public.goals_user_predefined_title_uniq;
-- drop index if exists public.goals_user_created_idx;
-- drop index if exists public.goals_user_active_idx;
-- drop table if exists public.goals;

-- Journal feature — Phase 1.
--
-- Creates public.journal_entries (user-owned, fully managed by the
-- user — read/insert/update/delete all allowed). The journal is a
-- private writing space; the coach has zero awareness of entries
-- unless the user explicitly shares specific entries when starting
-- a session (see StartSessionMenu's journal-share panel + the
-- buildSessionStartInput injection in src/lib/coaching-prompt.ts).
--
-- Schema notes:
--
-- title nullable — entries don't require a title; users get a
-- date/time stamp instead when no title is provided. Display fallback
-- lives in the UI, not the DB.
--
-- content NOT NULL with check (length(trim(content)) > 0) — empty
-- or whitespace-only entries are rejected at the DB level. The
-- length cap is enforced at the action layer (10K char hard truncate)
-- not via a CHECK, so future cap changes don't require a migration.
--
-- flagged_for_session boolean — user toggles this on entries they
-- want to bring into their next coaching session. The flag is
-- persistent until the entry is actually shared in a session-start
-- (cleared by clearFlagsOnEntries in src/lib/journal.ts after the
-- sessions row is inserted in startSession). Deselecting a flagged
-- entry in the share-step does NOT clear the flag — the user may
-- have wanted to share but changed their mind, so the flag stays
-- "active" for the next attempt.
--
-- Authentication / RLS: same pattern as goals, identity_tables, and
-- coaching_session_tables. RLS keys off auth.jwt()->>'sub' (Clerk
-- user ID via Supabase third-party auth). FORCE row level security
-- on; service_role bypasses RLS by design (no service-role writer
-- planned for this table beyond the user-deletion cascade, which
-- traverses the FK on user_id).
--
-- DELETE policy IS granted (unlike goals which is archive-only).
-- Journal entries are personal expressions; users own them and
-- should be able to remove them outright. Account-deletion cascade
-- still applies via the FK.
--
-- Idempotency: every CREATE / DROP uses IF [NOT] EXISTS / IF EXISTS.
-- Indexes, triggers, and policies are all existence-guarded so
-- partial-failure recovery and re-application are safe.

-- ---------------------------------------------------------------
-- Table: journal_entries
-- ---------------------------------------------------------------

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  title text,
  content text not null check (length(trim(content)) > 0),
  flagged_for_session boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
--   - journal_user_created_idx: primary list query — newest first per
--     user. Drives the journal list view AND the share-step's entry
--     list when starting a session.
--   - journal_user_flagged_idx: partial index for the "any flagged
--     entries?" check + "pre-select flagged ones in share-step" query.
--     Tiny because flagged is the rare case.

create index if not exists journal_user_created_idx
  on public.journal_entries (user_id, created_at desc);

create index if not exists journal_user_flagged_idx
  on public.journal_entries (user_id, created_at desc)
  where flagged_for_session = true;

-- updated_at trigger — reuses public.set_updated_at() defined in
-- 20260422062124_identity_tables.sql.

drop trigger if exists journal_entries_set_updated_at
  on public.journal_entries;
create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
-- authenticated role gets SELECT / INSERT / UPDATE / DELETE.
-- RLS gates which rows. anon / public ungranted.

grant select, insert, update, delete on table public.journal_entries
  to authenticated;

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------

alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;

drop policy if exists "journal_select_own" on public.journal_entries;
create policy "journal_select_own"
  on public.journal_entries
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "journal_insert_own" on public.journal_entries;
create policy "journal_insert_own"
  on public.journal_entries
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "journal_update_own" on public.journal_entries;
create policy "journal_update_own"
  on public.journal_entries
  for update
  to authenticated
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "journal_delete_own" on public.journal_entries;
create policy "journal_delete_own"
  on public.journal_entries
  for delete
  to authenticated
  using (user_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back, copy this block into a new ad-hoc SQL file and apply via
-- the Supabase dashboard SQL editor or `supabase db execute`.
--
-- drop policy if exists "journal_delete_own" on public.journal_entries;
-- drop policy if exists "journal_update_own" on public.journal_entries;
-- drop policy if exists "journal_insert_own" on public.journal_entries;
-- drop policy if exists "journal_select_own" on public.journal_entries;
-- drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
-- drop index if exists public.journal_user_flagged_idx;
-- drop index if exists public.journal_user_created_idx;
-- drop table if exists public.journal_entries;

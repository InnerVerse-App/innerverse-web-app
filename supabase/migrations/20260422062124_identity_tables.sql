-- Identity tables for InnerVerse (Phase 4 Chunk 4.2).
--
-- Two tables, both user-owned:
--   - users: bridges Clerk's user IDs (text) to local app data.
--   - onboarding_selections: 6-step onboarding answers that feed the
--     coaching prompt.
--
-- Authentication model: Clerk issues session JWTs validated by Supabase
-- via the Clerk JWKS third-party-auth integration. RLS policies key off
-- auth.jwt()->>'sub' (the Clerk user ID, type text).
--
-- Row creation lifecycle: this migration ships the schema only. First-
-- time user-row creation lands in chunk 4.2b — a Clerk webhook on
-- user.created → server-side INSERT via service_role. There is
-- INTENTIONALLY no `users_insert_own` policy: see Audit 2026-04-22 F8
-- (preventing identity-pollution before the webhook lands).
--
-- Idempotency: every CREATE / DROP uses IF NOT EXISTS / IF EXISTS so
-- partial-failure recovery and re-application are safe (Audit F11).
--
-- Rollback: see the commented "DOWN" block at the bottom.

-- ---------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------
-- search_path is pinned (Audit 2026-04-22 F2) to prevent search_path
-- hijacking via a hostile or shadow schema.
-- The "is distinct from" guard (Audit F12) avoids bumping updated_at
-- on no-op UPDATE statements.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new is distinct from old then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Table: users
-- ---------------------------------------------------------------
-- email is UNIQUE (Audit F3) so Clerk-Supabase drift can't produce
-- two rows with the same email.

create table if not exists public.users (
  id text primary key,
  display_name text,
  email text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: onboarding_selections
-- ---------------------------------------------------------------
-- One row per user. user_id is both PK and FK; ON DELETE CASCADE
-- removes onboarding when the parent users row is deleted (via the
-- Clerk webhook in 4.2b).

create table if not exists public.onboarding_selections (
  user_id text primary key references public.users(id) on delete cascade,
  coach_name text,
  coaching_style text,
  style_calibration text,
  ai_persona text,
  goals text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists onboarding_selections_set_updated_at on public.onboarding_selections;
create trigger onboarding_selections_set_updated_at
  before update on public.onboarding_selections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
-- Supabase doesn't grant table privileges to roles by default. RLS only
-- filters which rows are visible; the role still needs SELECT/INSERT/etc.
-- privileges on the table for the request to reach RLS at all.
-- Explicitly grant to authenticated role (signed-in users via Clerk JWT).
-- anon and public are intentionally left without grants.

grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.onboarding_selections to authenticated;

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------
-- FORCE row level security (Audit F17) is defense-in-depth: even
-- table owners cannot bypass RLS without explicitly turning off FORCE.

alter table public.users enable row level security;
alter table public.users force row level security;

alter table public.onboarding_selections enable row level security;
alter table public.onboarding_selections force row level security;

-- users:
-- - INSERT: NOT POLICIED for authenticated → server-side only via the
--   Clerk webhook (4.2b). Closes the identity-pollution window where
--   an attacker with a valid Clerk session could pre-claim an arbitrary
--   email or display_name (Audit F8).
-- - SELECT / UPDATE: own row only.
-- - DELETE: NOT POLICIED → service_role only via the Clerk
--   user.deleted webhook (4.2b).

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (id = auth.jwt()->>'sub');

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = auth.jwt()->>'sub')
  with check (id = auth.jwt()->>'sub');

-- onboarding_selections:
-- - SELECT / INSERT / UPDATE: own row, scoped via user_id.
-- - DELETE: NOT POLICIED. Cascade fires automatically when the parent
--   users row is deleted by service_role.

drop policy if exists "onboarding_select_own" on public.onboarding_selections;
create policy "onboarding_select_own"
  on public.onboarding_selections
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

drop policy if exists "onboarding_insert_own" on public.onboarding_selections;
create policy "onboarding_insert_own"
  on public.onboarding_selections
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

drop policy if exists "onboarding_update_own" on public.onboarding_selections;
create policy "onboarding_update_own"
  on public.onboarding_selections
  for update
  to authenticated
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll back,
-- copy this block into a new ad-hoc SQL file and apply it via the
-- Supabase dashboard SQL editor or `supabase db execute`.
--
-- drop policy if exists "onboarding_update_own" on public.onboarding_selections;
-- drop policy if exists "onboarding_insert_own" on public.onboarding_selections;
-- drop policy if exists "onboarding_select_own" on public.onboarding_selections;
-- drop policy if exists "users_update_own" on public.users;
-- drop policy if exists "users_select_own" on public.users;
-- drop trigger if exists onboarding_selections_set_updated_at on public.onboarding_selections;
-- drop trigger if exists users_set_updated_at on public.users;
-- drop table if exists public.onboarding_selections;
-- drop table if exists public.users;
-- drop function if exists public.set_updated_at();

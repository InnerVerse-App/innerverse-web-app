-- Identity tables for InnerVerse (Phase 4 Chunk 4.2).
--
-- Two tables, both user-owned:
--   - users: bridges Clerk's user IDs (text) to local app data.
--   - onboarding_selections: 6-step onboarding answers that feed the
--     coaching prompt.
--
-- Authentication model: Clerk issues session JWTs validated by Supabase
-- via the Clerk JWKS third-party-auth integration. RLS policies key off
-- auth.jwt()->>'sub' (the Clerk user ID, type text) rather than
-- auth.uid() (typed uuid in older Supabase versions; risky with text
-- Clerk IDs).
--
-- Row creation lifecycle: this migration ships the schema only. First-
-- time user-row creation lands in a follow-up chunk (4.2b — Clerk
-- webhook on user.created → server-side insert via service_role).
--
-- Rollback: see the commented "DOWN" block at the bottom of this file.

-- ---------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Table: users
-- ---------------------------------------------------------------

create table public.users (
  id text primary key,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: onboarding_selections
-- ---------------------------------------------------------------
-- One row per user (user_id is both PK and FK). On user delete, this
-- row cascades.

create table public.onboarding_selections (
  user_id text primary key references public.users(id) on delete cascade,
  coach_name text,
  coaching_style text,
  style_calibration text,
  ai_persona text,
  goals text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.users enable row level security;
alter table public.onboarding_selections enable row level security;

-- users: a signed-in user can only see, create, or modify their own row.
-- DELETE is intentionally not policied → denied for authenticated.
-- Account deletion goes through service_role (which bypasses RLS) via
-- a Clerk webhook (Chunk 4.2b).

create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (id = auth.jwt()->>'sub');

create policy "users_insert_own"
  on public.users
  for insert
  to authenticated
  with check (id = auth.jwt()->>'sub');

create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (id = auth.jwt()->>'sub')
  with check (id = auth.jwt()->>'sub');

-- onboarding_selections: same pattern, scoped via user_id.

create policy "onboarding_select_own"
  on public.onboarding_selections
  for select
  to authenticated
  using (user_id = auth.jwt()->>'sub');

create policy "onboarding_insert_own"
  on public.onboarding_selections
  for insert
  to authenticated
  with check (user_id = auth.jwt()->>'sub');

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
-- drop policy "onboarding_update_own" on public.onboarding_selections;
-- drop policy "onboarding_insert_own" on public.onboarding_selections;
-- drop policy "onboarding_select_own" on public.onboarding_selections;
-- drop policy "users_update_own" on public.users;
-- drop policy "users_insert_own" on public.users;
-- drop policy "users_select_own" on public.users;
-- drop trigger if exists onboarding_selections_set_updated_at on public.onboarding_selections;
-- drop trigger if exists users_set_updated_at on public.users;
-- drop table if exists public.onboarding_selections;
-- drop table if exists public.users;
-- drop function if exists public.set_updated_at();

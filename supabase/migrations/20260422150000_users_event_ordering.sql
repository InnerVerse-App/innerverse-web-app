-- Webhook idempotency + event ordering hardening
-- (Audit 2026-04-22 F1: out-of-order Clerk events could overwrite
-- newer data with older data; pre-fetch + write would race).
--
-- Adds:
--   - users.last_event_at: timestamp of the most recent Clerk webhook
--     event we applied for this row.
--   - public.upsert_user_from_clerk(): race-safe conditional upsert.
--     Insert if absent; update existing row only if the incoming
--     event is newer than the row's last_event_at. Stale or duplicate
--     events become no-ops.
--
-- Why a SQL function instead of compare-then-write in JS: two webhook
-- handlers can read state then race to write. The conditional UPDATE
-- inside ON CONFLICT runs as a single statement, so Postgres
-- serializes the decision and eliminates the read/write window.
--
-- Idempotency: column add and function create both use the
-- IF NOT EXISTS / OR REPLACE pattern (Audit F11) so re-applying the
-- migration is safe.

alter table public.users
  add column if not exists last_event_at timestamptz;

create or replace function public.upsert_user_from_clerk(
  p_id text,
  p_display_name text,
  p_email text,
  p_event_at timestamptz
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.users (id, display_name, email, last_event_at)
  values (p_id, p_display_name, p_email, p_event_at)
  on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        last_event_at = excluded.last_event_at
    where public.users.last_event_at is null
       or excluded.last_event_at > public.users.last_event_at;
end;
$$;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back, copy this block into a new ad-hoc SQL file and apply via
-- the Supabase dashboard SQL editor or `supabase db execute`.
--
-- drop function if exists public.upsert_user_from_clerk(text, text, text, timestamptz);
-- alter table public.users drop column if exists last_event_at;

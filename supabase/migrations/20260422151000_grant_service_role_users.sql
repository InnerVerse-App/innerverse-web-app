-- service_role grants on identity tables
-- (Audit 2026-04-22 follow-up — discovered post-creation of PR #17).
--
-- PostgREST returned 42501 (permission denied for table) when
-- service_role tried to read or write public.users and
-- public.onboarding_selections. Supabase's default privileges
-- normally grant service_role automatically, but in this project
-- those defaults aren't kicking in, so the Clerk webhook (which
-- writes via service_role) cannot create, update, or delete user
-- rows without the explicit grants below.
--
-- Also sets default privileges on the public schema so future
-- tables and functions created by the migration role pick up
-- service_role grants automatically — preventing this same
-- foot-gun next time a table is added.

grant select, insert, update, delete on table public.users to service_role;
grant select, insert, update, delete on table public.onboarding_selections to service_role;
grant execute on function public.upsert_user_from_clerk(text, text, text, timestamptz) to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- alter default privileges in schema public revoke execute on functions from service_role;
-- alter default privileges in schema public revoke select, insert, update, delete on tables from service_role;
-- revoke execute on function public.upsert_user_from_clerk(text, text, text, timestamptz) from service_role;
-- revoke select, insert, update, delete on table public.onboarding_selections from service_role;
-- revoke select, insert, update, delete on table public.users from service_role;

-- Home-tab extras: columns that back the richer Home cards and the
-- new /next-steps checklist (Phase 7 Chunk 1).
--
-- Schema-only migration. The paired prompt + RPC update that starts
-- populating coach_message and breakthroughs.note ships in a follow-up
-- chunk; until that lands, both columns stay NULL on new rows. Old rows
-- are never backfilled (intentional — backfill would require re-running
-- the session-end LLM over every historical transcript). The UI hides
-- null sub-elements gracefully.
--
-- Three additive columns, all nullable where possible so the migration
-- is non-destructive and can land ahead of the prompt/RPC change:
--
--   - breakthroughs.note text          -- subtext displayed under the
--                                         breakthrough content in Home
--                                         "Recent Breakthroughs" card
--                                         (e.g. "Sharper focus on
--                                         validation through actual
--                                         users"). Bubble called this
--                                         field 'note'; see Phase 6
--                                         migration header comment,
--                                         dropped-fields list.
--
--   - sessions.coach_message text      -- short reflective takeaway
--                                         rendered in the Home
--                                         "Message from your Coach"
--                                         card. Separate from
--                                         sessions.summary (long-form)
--                                         and progress_summary_short
--                                         (progress-flavored).
--
--   - next_steps.status text           -- checklist state for the
--                                         /next-steps page. NOT NULL
--                                         with default 'pending' so
--                                         existing rows become pending
--                                         on migrate. CHECK constraint
--                                         restricts to the two values
--                                         we render.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS on every column so partial
-- failure recovery and re-application are safe (Audit F11).
--
-- RLS: no new policies. The existing *_select_own / *_update_own /
-- *_insert_own policies on breakthroughs, sessions, and next_steps
-- cover these columns by default — column-level RLS isn't used on
-- this project.

alter table public.breakthroughs
  add column if not exists note text;

alter table public.sessions
  add column if not exists coach_message text;

alter table public.next_steps
  add column if not exists status text not null default 'pending';

-- CHECK constraint added separately so it can co-exist with ADD COLUMN
-- IF NOT EXISTS on re-run. Existence-guarded via pg_constraint lookup.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'next_steps_status_check'
      and conrelid = 'public.next_steps'::regclass
  ) then
    alter table public.next_steps
      add constraint next_steps_status_check
      check (status in ('pending', 'done'));
  end if;
end $$;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back, copy this block into a new ad-hoc SQL file and apply via the
-- Supabase dashboard SQL editor or `supabase db execute`.
--
-- alter table public.next_steps drop constraint if exists next_steps_status_check;
-- alter table public.next_steps drop column if exists status;
-- alter table public.sessions drop column if exists coach_message;
-- alter table public.breakthroughs drop column if exists note;

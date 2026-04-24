-- Home-tab extras: columns + one RLS policy that back the richer Home
-- cards and the new /next-steps checklist.
--
-- Schema-mostly migration. The paired prompt + process_session_end RPC
-- update that starts populating coach_message and breakthroughs.note
-- ships in a follow-up chunk; until that lands, both columns stay NULL
-- on new rows. Old rows are never backfilled (intentional — backfill
-- would require re-running the session-end LLM over every historical
-- transcript). The UI hides null sub-elements gracefully.
--
-- Deployment ordering: this migration MUST land on every deployed
-- environment before the follow-up RPC update. The follow-up RPC
-- writes to coach_message + breakthroughs.note; if the RPC lands first
-- on prod, session-end writes will fail with "column does not exist"
-- and roll back the entire session-end transaction, leaving sessions
-- permanently stuck with summary=NULL. Timestamp ordering
-- (20260424120000 < whatever ships for the RPC update) makes
-- `supabase db push` serialize correctly when both are unapplied, but
-- split-deploys must apply this one first.
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
-- RLS: one new policy. Column-level RLS isn't used on this project;
-- existing *_select_own / *_insert_own policies on breakthroughs,
-- sessions, and next_steps cover the two new nullable columns by
-- default. BUT next_steps shipped in 20260422170000 with only SELECT
-- + INSERT policies — no UPDATE policy — because Tier-1 session-end
-- only INSERTs. The Home-tab /next-steps checklist needs to toggle
-- status client-side, which requires UPDATE. Adding
-- next_steps_update_own here so the policy lands atomically with the
-- column it gates (flagged by the 2026-04-24 fresh-session audit).

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
-- RLS policy: next_steps UPDATE
-- ---------------------------------------------------------------
-- Mirrors the sessions_update_own pattern: USING + WITH CHECK both
-- key off auth.jwt()->>'sub'. No session-ownership subquery here
-- because next_steps.user_id is already denormalized (same pattern
-- as messages_insert_own from 20260422170000), and a row can only
-- be in the result set if user_id matches already.

drop policy if exists "next_steps_update_own" on public.next_steps;
create policy "next_steps_update_own"
  on public.next_steps
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
-- drop policy if exists "next_steps_update_own" on public.next_steps;
-- alter table public.next_steps drop constraint if exists next_steps_status_check;
-- alter table public.next_steps drop column if exists status;
-- alter table public.sessions drop column if exists coach_message;
-- alter table public.breakthroughs drop column if exists note;

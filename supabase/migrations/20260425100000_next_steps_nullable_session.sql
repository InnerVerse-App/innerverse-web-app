-- Goals tab Phase 5 — Chunk G.1.5.
--
-- Makes public.next_steps.session_id NULL-able and updates
-- next_steps_insert_own RLS to permit NULL session_id rows.
--
-- Why: G.3's lazy seed and G.4's createGoal flow both INSERT a
-- "starter" next_step row at the moment a goal is created, before
-- the user has run any session against that goal. The original
-- next_steps schema (20260422170000) declared session_id NOT NULL,
-- which would have failed those inserts at runtime, AND the
-- existing RLS WITH CHECK clause requires session_id to belong to
-- one of the user's sessions — also failing for system-generated
-- starters.
--
-- The 2026-04-25 plan-level fresh-session review (recorded in the
-- KNOWN_FOLLOW_UPS.md G.1 audit section) flagged this as the
-- single critical bug in the G.1-G.5 plan. Three options were
-- considered:
--   (a) Skip starter next_steps; let the first session populate.
--       Rejected — operator's product requirement is that
--       not_started goals have an action item from day one.
--   (c) Sentinel "system" session per user. Rejected — phantom row
--       per user, hard to reason about.
--   (b) Make session_id nullable. ACCEPTED — minimal blast radius,
--       semantic stays clear (NULL session_id = system-generated
--       starter, not from any session).
--
-- No data migration needed. Existing next_steps rows all have
-- non-NULL session_id (they came from process_session_end with a
-- real session); the column-nullability change is additive.
--
-- Idempotency: ALTER COLUMN ... DROP NOT NULL is idempotent in
-- Postgres (no error if already nullable). DROP POLICY IF EXISTS
-- before re-creating policy is the existing pattern.

-- ---------------------------------------------------------------
-- Drop NOT NULL
-- ---------------------------------------------------------------

alter table public.next_steps
  alter column session_id drop not null;

-- ---------------------------------------------------------------
-- Replace next_steps_insert_own
-- ---------------------------------------------------------------
-- Previous policy from 20260422170000:
--   user_id = auth.jwt()->>'sub'
--   AND session_id IN (SELECT id FROM sessions WHERE user_id = ...)
--
-- New policy:
--   user_id = auth.jwt()->>'sub'
--   AND (session_id IS NULL OR session_id IN (...))
--
-- The IS NULL branch covers system-generated starter rows. The
-- existing branch covers session-end RPC writes. user_id check is
-- unchanged — RLS still scopes the row to the caller.

drop policy if exists "next_steps_insert_own" on public.next_steps;
create policy "next_steps_insert_own"
  on public.next_steps
  for insert
  to authenticated
  with check (
    user_id = auth.jwt()->>'sub'
    and (
      session_id is null
      or session_id in (
        select id from public.sessions where user_id = auth.jwt()->>'sub'
      )
    )
  );

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Order matters: re-add NOT NULL only after confirming no rows
-- have NULL session_id (a NULL row would block the constraint).
--
-- -- Step 1: confirm no NULL rows
-- -- SELECT count(*) FROM public.next_steps WHERE session_id IS NULL;
-- -- (Must be 0 before continuing.)
--
-- -- Step 2: revert RLS to the prior policy
-- drop policy if exists "next_steps_insert_own" on public.next_steps;
-- create policy "next_steps_insert_own"
--   on public.next_steps
--   for insert
--   to authenticated
--   with check (
--     user_id = auth.jwt()->>'sub'
--     and session_id in (
--       select id from public.sessions where user_id = auth.jwt()->>'sub'
--     )
--   );
--
-- -- Step 3: re-add NOT NULL
-- alter table public.next_steps alter column session_id set not null;

-- Adds the disclaimer-acknowledgment timestamp to public.users.
-- The /disclaimer gate appears post-onboarding, pre-home, and writes
-- now() to this column when the user taps "I understand". Existing
-- pre-launch users have NULL and will see the gate on their next
-- visit — acceptable since the user count is single-digit.
--
-- Why on users (not onboarding_selections): the disclaimer is an
-- account-level legal acknowledgment, not part of per-user onboarding
-- answers. Keeping the semantics clean here also means a future
-- "re-acknowledge after terms change" flow only has to touch one
-- column instead of co-evolving with onboarding shape.

alter table public.users
  add column if not exists disclaimer_acknowledged_at timestamptz;

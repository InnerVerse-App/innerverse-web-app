-- Reverts the short-lived disclaimer-acknowledgment column on
-- public.users. The accompanying disclaimer gate (PR #175) was
-- closed without merging once it became clear that ToS + Privacy
-- Policy + Clerk's sign-up acknowledgment are sufficient legal
-- coverage in both US and EU jurisdictions, so the custom gate
-- and its column are no longer needed.
--
-- The column was applied to innerverse-dev and innerverse-prod
-- out-of-band while the PR was open; this migration brings the
-- DB state back in line with the main-branch migration history.
-- The "if exists" clause makes it a no-op on any fresh DB that
-- never saw the original ADD migration.

alter table public.users
  drop column if exists disclaimer_acknowledged_at;

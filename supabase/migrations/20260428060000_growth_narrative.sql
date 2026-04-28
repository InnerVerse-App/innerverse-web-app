-- Cumulative growth narrative — a rolling 2-3 paragraph "where you've
-- been" letter from the coach, updated each session by a dedicated
-- background pipeline (separate from the per-session analyzer).
-- Stored on coaching_state (one row per user). Read by /home's
-- Message from your Coach card.
--
-- The narrative writer runs as a separate API route after the
-- analyzer finishes; it owns its own OpenAI call and writes directly
-- to coaching_state.growth_narrative under service_role. The
-- per-session process_session_end RPC stays unchanged.
--
-- Idempotent: skips if the column already exists.

alter table public.coaching_state
  add column if not exists growth_narrative text;

alter table public.coaching_state
  add column if not exists growth_narrative_updated_at timestamptz;

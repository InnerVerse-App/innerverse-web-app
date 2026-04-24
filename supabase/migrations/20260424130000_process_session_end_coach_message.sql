-- Session-end RPC update — populate sessions.coach_message and
-- breakthroughs.note from the LLM JSON.
--
-- DEPLOYMENT ORDERING: this migration MUST land after
-- 20260424120000_home_extras_columns.sql on every environment. The
-- coach_message and note columns must exist before this RPC runs.
-- Timestamp ordering guarantees supabase db push serializes correctly
-- when both are unapplied; split-deploy hazard documented in the
-- 20260424120000 header.
--
-- Breaking JSON-shape change: breakthroughs is now an array of
-- {content, note} objects, not bare strings. The paired prompt
-- (reference/prompt-session-end-v4.md) and TypeScript JSON schema
-- (src/lib/session-end.ts SESSION_END_SCHEMA) ship together — all
-- three land atomically in PR #55. OpenAI structured outputs
-- enforce the schema, so old-format (bare-string) responses cannot
-- reach this function in normal operation; the defensive
-- jsonb_typeof(elem) = 'object' guard below catches them anyway and
-- silently skips, mirroring the parent-array jsonb_typeof guard
-- added in 20260423120000.
--
-- Length cap on coach_message: the prompt says "1–3 sentences" but
-- defense-in-depth for LLM drift — the field is capped to 2000
-- characters at write time (`left(..., 2000)`). Far larger than any
-- legitimate 1–3 sentence output, small enough to prevent an
-- accidental full-summary dump from bloating the row. No cap on
-- breakthroughs content/note today (future cleanup).
--
-- Trust boundary: SECURITY INVOKER enforces RLS on caller credentials.
-- The grant to service_role (for the abandonment cron) bypasses RLS
-- by design — the cron's own session-selection query is the sole gate
-- on which sessions it analyzes. Same posture as 20260423080000 and
-- 20260423120000; no new trust surface here.
--
-- Everything else — SECURITY INVOKER, search_path pin, idempotency
-- via summary-is-null guard, ±0.1 delta clamp, ±1.0 running-sum
-- clamp, progress_percent 0-100 clamp, jsonb_typeof array guards —
-- carries forward from 20260423120000 unchanged.

create or replace function public.process_session_end(
  p_session_id uuid,
  p_analysis jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_delta_directness double precision;
  v_delta_warmth double precision;
  v_delta_challenge double precision;
  v_progress_raw bigint;
  v_progress smallint;
begin
  -- Parse and clamp progress_percent.
  v_progress_raw := nullif(p_analysis ->> 'progress_percent', '')::bigint;
  if v_progress_raw is null then
    v_progress := null;
  else
    v_progress := greatest(0, least(100, v_progress_raw))::smallint;
  end if;

  -- Idempotency guard + session UPDATE. coach_message normalizes
  -- the empty-string case to NULL so the Home card's null-check
  -- hides the card cleanly instead of rendering an empty paragraph.
  update public.sessions
  set summary = p_analysis ->> 'session_summary',
      progress_summary_short = p_analysis ->> 'progress_summary_short',
      progress_percent = v_progress,
      coach_message = nullif(left(p_analysis ->> 'coach_message', 2000), ''),
      language_patterns_observed = case
        when jsonb_typeof(p_analysis -> 'language_patterns_observed') = 'array' then
          coalesce(
            (select array_agg(value::text) from jsonb_array_elements_text(
              p_analysis -> 'language_patterns_observed'
            )),
            '{}'
          )
        else '{}'
      end,
      nervous_system_markers = p_analysis ->> 'nervous_system_markers',
      trauma_protocol_triggered = coalesce(
        (p_analysis ->> 'trauma_protocol_triggered')::boolean,
        false
      ),
      reflection_mode_recommendation = p_analysis ->> 'reflection_mode_recommendation',
      tone_feedback_recommendation = p_analysis ->> 'tone_feedback_recommendation',
      tool_glossary_suggestions = case
        when jsonb_typeof(p_analysis -> 'tool_glossary_suggestions') = 'array' then
          coalesce(
            (select array_agg(value::text) from jsonb_array_elements_text(
              p_analysis -> 'tool_glossary_suggestions'
            )),
            '{}'
          )
        else '{}'
      end
  where id = p_session_id
    and summary is null
  returning user_id into v_user_id;

  if v_user_id is null then
    return false;
  end if;

  -- Breakthroughs: new shape [{content, note}]. jsonb_typeof guards
  -- both the array and each element. Empty-string note normalizes
  -- to NULL so the Home card hides the subtext line cleanly.
  -- jsonb_array_elements (not _text) preserves object structure.
  if jsonb_typeof(p_analysis -> 'breakthroughs') = 'array' then
    insert into public.breakthroughs (user_id, session_id, content, note)
    select
      v_user_id,
      p_session_id,
      elem ->> 'content',
      nullif(elem ->> 'note', '')
    from jsonb_array_elements(p_analysis -> 'breakthroughs') as elem
    where jsonb_typeof(elem) = 'object'
      and length(trim(coalesce(elem ->> 'content', ''))) > 0;
  end if;

  if jsonb_typeof(p_analysis -> 'mindset_shifts') = 'array' then
    insert into public.insights (user_id, session_id, content)
    select v_user_id, p_session_id, value
    from jsonb_array_elements_text(p_analysis -> 'mindset_shifts')
    where length(trim(value)) > 0;
  end if;

  if jsonb_typeof(p_analysis -> 'recommended_next_steps') = 'array' then
    insert into public.next_steps (user_id, session_id, content)
    select v_user_id, p_session_id, value
    from jsonb_array_elements_text(p_analysis -> 'recommended_next_steps')
    where length(trim(value)) > 0;
  end if;

  -- Style calibration deltas applied to the running coaching_state
  -- row. Clamp incoming delta to ±0.1 (prompt contract) and the
  -- running sum to ±1.0.
  v_delta_directness := greatest(-0.1, least(0.1,
    coalesce((p_analysis -> 'style_calibration_delta' ->> 'directness')::double precision, 0)
  ));
  v_delta_warmth := greatest(-0.1, least(0.1,
    coalesce((p_analysis -> 'style_calibration_delta' ->> 'warmth')::double precision, 0)
  ));
  v_delta_challenge := greatest(-0.1, least(0.1,
    coalesce((p_analysis -> 'style_calibration_delta' ->> 'challenge')::double precision, 0)
  ));

  insert into public.coaching_state (user_id, directness, warmth, challenge)
  values (v_user_id, v_delta_directness, v_delta_warmth, v_delta_challenge)
  on conflict (user_id) do update set
    directness = greatest(-1.0, least(1.0, public.coaching_state.directness + excluded.directness)),
    warmth = greatest(-1.0, least(1.0, public.coaching_state.warmth + excluded.warmth)),
    challenge = greatest(-1.0, least(1.0, public.coaching_state.challenge + excluded.challenge)),
    updated_at = now();

  return true;
end;
$$;

-- Grants carry over; re-issuing is harmless and keeps the migration
-- independently re-runnable.
grant execute on function public.process_session_end(uuid, jsonb) to authenticated;
grant execute on function public.process_session_end(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back this RPC body (leaving the coach_message and note columns
-- in place — they're harmless when unused), copy the full
-- `create or replace function public.process_session_end ...` block
-- from 20260423120000_process_session_end_defensive_parse.sql and
-- apply via the Supabase dashboard SQL editor or `supabase db execute`.
-- That restores the pre-coach_message, pre-object-breakthroughs
-- function body atomically (CREATE OR REPLACE replaces in place).
--
-- If the columns themselves must also be dropped, apply the DOWN
-- block from 20260424120000_home_extras_columns.sql AFTER reverting
-- the function — doing it before would leave the prior function
-- referencing coach_message via the pre-revert state.

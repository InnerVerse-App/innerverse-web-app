-- Harden process_session_end against malformed LLM output (2026-04-23
-- fresh-session audit findings 6 + 7).
--
-- Two defensive changes vs the prior definition in
-- 20260423080000_process_session_end_function.sql:
--
-- 1. progress_percent is now clamped to 0..100 BEFORE the smallint
--    cast. The table CHECK constraint previously caught out-of-range
--    values, but it fired after the UPDATE and rolled the whole
--    transaction back — including the session UPDATE, child INSERTs,
--    and coaching_state upsert — which left the session permanently
--    stuck with summary null. Matches the explicit-clamp pattern
--    already used for style_calibration deltas.
--
-- 2. Each jsonb_array_elements_text call is guarded by a
--    jsonb_typeof check so a non-array value (null, string, object)
--    short-circuits to empty instead of raising
--    `cannot extract elements from a scalar`. Same failure mode —
--    one malformed field would roll back the entire transaction
--    with no retry path.
--
-- Everything else (SECURITY INVOKER, search_path pin, ±0.1 delta
-- clamp, ±1.0 running-sum clamp, idempotency guard) carries over
-- unchanged.

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
  -- Parse and clamp progress_percent. nullif handles the empty-string
  -- case; bigint as the intermediate type avoids smallint overflow
  -- on garbage input like "999999".
  v_progress_raw := nullif(p_analysis ->> 'progress_percent', '')::bigint;
  if v_progress_raw is null then
    v_progress := null;
  else
    v_progress := greatest(0, least(100, v_progress_raw))::smallint;
  end if;

  -- Idempotency guard + do the session UPDATE.
  update public.sessions
  set summary = p_analysis ->> 'session_summary',
      progress_summary_short = p_analysis ->> 'progress_summary_short',
      progress_percent = v_progress,
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

  -- One row per string in each analysis array. jsonb_typeof guards
  -- against a non-array field crashing the whole transaction.
  if jsonb_typeof(p_analysis -> 'breakthroughs') = 'array' then
    insert into public.breakthroughs (user_id, session_id, content)
    select v_user_id, p_session_id, value
    from jsonb_array_elements_text(p_analysis -> 'breakthroughs')
    where length(trim(value)) > 0;
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

-- Grants carry over from 20260423080000; re-issuing them is harmless
-- and makes this migration independently re-runnable.
grant execute on function public.process_session_end(uuid, jsonb) to authenticated;
grant execute on function public.process_session_end(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------
-- DOWN (rollback — restores the pre-audit function body)
-- ---------------------------------------------------------------
-- Re-apply 20260423080000_process_session_end_function.sql's
-- `create or replace function ...` block to revert.

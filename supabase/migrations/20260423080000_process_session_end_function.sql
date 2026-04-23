-- Atomic session-end write (Phase 6 Chunk 6.3).
--
-- process_session_end(p_session_id, p_analysis) consumes the JSON
-- returned by the gpt-5 session-end prompt (reference/prompt-session-
-- end-v3.md) and writes across sessions, breakthroughs, insights,
-- next_steps, and coaching_state in a single transaction. The SQL
-- function body is one transaction by construction — any error
-- rolls back every write.
--
-- Idempotency: the UPDATE on public.sessions is guarded by
-- `WHERE summary IS NULL`. A second invocation for the same session
-- (e.g., user's End-click background job racing the abandonment cron)
-- finds summary already set, skips the UPDATE, and returns false
-- without running the child INSERTs. This is the 6.1-audit carry-
-- forward requirement (b).
--
-- Security: SECURITY INVOKER so RLS policies enforce that the caller
-- owns the session. The cron sweep runs as service_role which bypasses
-- RLS — that's intentional (the cron has no user context).
--
-- search_path is pinned to prevent hijacking via a hostile schema
-- (same pattern as set_updated_at and upsert_user_from_clerk).
--
-- Delta clamping: the prompt says session_end deltas are ±0.1. The
-- function defensively re-clamps each delta to ±0.1 regardless of
-- what the application passes, and the running coaching_state value
-- is clamped to ±1.0.

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
begin
  -- Idempotency guard + do the session UPDATE.
  update public.sessions
  set summary = p_analysis ->> 'session_summary',
      progress_summary_short = p_analysis ->> 'progress_summary_short',
      progress_percent = nullif(p_analysis ->> 'progress_percent', '')::smallint,
      language_patterns_observed = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
          p_analysis -> 'language_patterns_observed'
        )),
        '{}'
      ),
      nervous_system_markers = p_analysis ->> 'nervous_system_markers',
      trauma_protocol_triggered = coalesce(
        (p_analysis ->> 'trauma_protocol_triggered')::boolean,
        false
      ),
      reflection_mode_recommendation = p_analysis ->> 'reflection_mode_recommendation',
      tone_feedback_recommendation = p_analysis ->> 'tone_feedback_recommendation',
      tool_glossary_suggestions = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
          p_analysis -> 'tool_glossary_suggestions'
        )),
        '{}'
      )
  where id = p_session_id
    and summary is null
  returning user_id into v_user_id;

  if v_user_id is null then
    return false;
  end if;

  -- One row per string in each analysis array.
  insert into public.breakthroughs (user_id, session_id, content)
  select v_user_id, p_session_id, value
  from jsonb_array_elements_text(p_analysis -> 'breakthroughs')
  where length(trim(value)) > 0;

  insert into public.insights (user_id, session_id, content)
  select v_user_id, p_session_id, value
  from jsonb_array_elements_text(p_analysis -> 'mindset_shifts')
  where length(trim(value)) > 0;

  insert into public.next_steps (user_id, session_id, content)
  select v_user_id, p_session_id, value
  from jsonb_array_elements_text(p_analysis -> 'recommended_next_steps')
  where length(trim(value)) > 0;

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

-- Grants: authenticated users invoke via the End-button flow under
-- their own RLS; service_role invokes from the abandonment cron.
grant execute on function public.process_session_end(uuid, jsonb) to authenticated;
grant execute on function public.process_session_end(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- drop function if exists public.process_session_end(uuid, jsonb);

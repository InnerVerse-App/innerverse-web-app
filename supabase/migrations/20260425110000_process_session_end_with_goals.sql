-- Session-end RPC update — process updated_goals[] from the LLM JSON
-- (Phase 5 G.2).
--
-- DEPLOYMENT ORDERING: this migration MUST land after
-- 20260425090000 (goals table) and 20260425100000 (nullable
-- next_steps.session_id + RLS) on every environment. Both are
-- prerequisites:
--   - The goals table is the UPDATE target.
--   - next_steps.goal_id is the per-goal-step linkage column.
--   - The next_steps RLS update from G.1.5 isn't strictly required
--     here (this RPC is SECURITY INVOKER and writes use real
--     session_id), but the prior migration is part of the same
--     phase and must precede G.3's starter-next-step writes.
-- Timestamp ordering serializes correctly under supabase db push.
--
-- Coupled change: this RPC update lands together with prompt-session-
-- end-v5.md and the SESSION_END_SCHEMA TypeScript change in
-- src/lib/session-end.ts. The strict-mode JSON schema enforces the
-- updated_goals shape on the OpenAI side; this RPC defensively
-- validates again at write time.
--
-- Service-role isolation (plan-level audit PLAN-FINDING 3, deferred
-- from PR #70 audit FINDING 5): the RPC is granted to authenticated
-- AND service_role. service_role bypasses RLS by design (cron sweep
-- for abandoned sessions). When the LLM emits an updated_goals entry
-- with a goal_id that belongs to a DIFFERENT user, the UPDATE must
-- not write through under service_role. Defense:
--   (a) v_user_id is derived from sessions.user_id (the parent of
--       p_session_id), NOT from auth.jwt()->>'sub' which is NULL
--       under service_role.
--   (b) Every goals UPDATE includes WHERE user_id = v_user_id, so
--       a hallucinated cross-user goal_id silently misses.
--   (c) Same scoping for next_steps INSERT: user_id := v_user_id,
--       session_id := p_session_id. The goal_id is set from the
--       LLM but UPDATE could-not-touch a foreign goal in (b), so
--       the next_steps INSERT also can't.
--
-- Defensive parse contract (carries forward from 20260423120000):
--   - jsonb_typeof check on every array before iterating.
--   - jsonb_typeof(elem) = 'object' check on each item.
--   - left(text, 2000) clamp on free-text fields landing in
--     unbounded text columns (matches the coach_message pattern).
--   - progress_percent clamped to 0..100 via greatest/least before
--     the smallint cast.
--   - status enum-validity check via CASE expression — silent
--     skip for invalid values. Defense-in-depth; strict-mode schema
--     should already prevent this.
--
-- Idempotency carries forward via the existing
-- WHERE id = p_session_id AND summary IS NULL guard on the parent
-- UPDATE. A second invocation for the same session sees summary
-- already set, returns false, and skips the entire children writes
-- (including the new updated_goals block).

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
  v_goal_elem jsonb;
  v_goal_id uuid;
  v_goal_status text;
  v_goal_progress_raw bigint;
  v_goal_progress smallint;
  v_goal_rationale text;
  v_goal_next_step text;
begin
  -- Parse and clamp progress_percent for the session-level write.
  v_progress_raw := nullif(p_analysis ->> 'progress_percent', '')::bigint;
  if v_progress_raw is null then
    v_progress := null;
  else
    v_progress := greatest(0, least(100, v_progress_raw))::smallint;
  end if;

  -- Idempotency guard + session UPDATE.
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

  -- Breakthroughs: array of {content, note}. jsonb_typeof guards
  -- both the array and each element. Empty-string note normalizes
  -- to NULL.
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

  -- General (goal-agnostic) next_steps from the flat array.
  -- goal_id stays NULL — these aren't tied to a specific goal.
  if jsonb_typeof(p_analysis -> 'recommended_next_steps') = 'array' then
    insert into public.next_steps (user_id, session_id, goal_id, content)
    select v_user_id, p_session_id, null, value
    from jsonb_array_elements_text(p_analysis -> 'recommended_next_steps')
    where length(trim(value)) > 0;
  end if;

  -- updated_goals: per-goal status / progress / rationale updates,
  -- plus an optional per-goal suggested_next_step that becomes a
  -- next_steps row tied to that goal.
  --
  -- Iterated in a FOR loop (rather than a single INSERT...SELECT)
  -- so each entry can be validated independently and skipped on
  -- bad data without aborting the rest. Same defensive shape as
  -- the breakthroughs jsonb_typeof guard, extended to the
  -- per-element fields.
  if jsonb_typeof(p_analysis -> 'updated_goals') = 'array' then
    for v_goal_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'updated_goals') as t(value)
      where jsonb_typeof(value) = 'object'
    loop
      -- Validate goal_id is a real UUID.
      begin
        v_goal_id := (v_goal_elem ->> 'goal_id')::uuid;
      exception when others then
        v_goal_id := null;
      end;
      if v_goal_id is null then
        continue;
      end if;

      -- Status enum check — silent skip on invalid value.
      v_goal_status := v_goal_elem ->> 'status';
      if v_goal_status not in ('not_started', 'on_track', 'at_risk') then
        continue;
      end if;

      -- Progress clamp via bigint intermediate to avoid smallint
      -- overflow on garbage input. NULL / empty string → NULL.
      v_goal_progress_raw := nullif(v_goal_elem ->> 'progress_percent', '')::bigint;
      if v_goal_progress_raw is null then
        v_goal_progress := null;
      else
        v_goal_progress := greatest(0, least(100, v_goal_progress_raw))::smallint;
      end if;

      v_goal_rationale := nullif(left(v_goal_elem ->> 'progress_rationale', 2000), '');
      v_goal_next_step := nullif(left(v_goal_elem ->> 'suggested_next_step', 2000), '');

      -- UPDATE the goal. Cross-user defense lives in the WHERE
      -- clause: user_id = v_user_id (derived from sessions, not
      -- auth.jwt() — service_role-safe). archived_at IS NULL
      -- prevents the LLM from resurrecting an archived goal.
      update public.goals
      set status = v_goal_status,
          progress_percent = v_goal_progress,
          progress_rationale = v_goal_rationale,
          last_session_id = p_session_id
      where id = v_goal_id
        and user_id = v_user_id
        and archived_at is null;

      -- INSERT the per-goal next_step only when both:
      --   (a) suggested_next_step is non-empty, AND
      --   (b) the UPDATE above actually touched a row owned by
      --       this user (FOUND is true). Without (b), a hallucinated
      --       goal_id would still produce a next_steps row pointing
      --       at a non-existent or foreign goal — the goals_id FK
      --       would catch foreign IDs, but the cross-user variant
      --       could create an orphaned next_step under v_user_id.
      if v_goal_next_step is not null and found then
        insert into public.next_steps (user_id, session_id, goal_id, content)
        values (v_user_id, p_session_id, v_goal_id, v_goal_next_step);
      end if;
    end loop;
  end if;

  -- Style calibration deltas (unchanged from 20260424130000).
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

-- Grants carry forward from the prior process_session_end migration.
grant execute on function public.process_session_end(uuid, jsonb) to authenticated;
grant execute on function public.process_session_end(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------
-- DOWN (rollback)
-- ---------------------------------------------------------------
-- Supabase CLI doesn't run down migrations automatically. To roll
-- back this RPC body (leaving the goals + next_steps schema in
-- place — both are harmless when not written by the RPC), copy the
-- full `create or replace function public.process_session_end ...`
-- block from 20260424130000_process_session_end_coach_message.sql
-- and apply via the Supabase dashboard SQL editor or
-- `supabase db execute`. That restores the pre-updated_goals body
-- atomically (CREATE OR REPLACE replaces in place).
--
-- The TypeScript-side rollback (revert SESSION_END_SCHEMA in
-- src/lib/session-end.ts to drop updated_goals from required, and
-- restore the prompt-session-end-v4.md path) must land in the same
-- deploy as the RPC revert. Otherwise strict-mode JSON validation
-- will continue requiring updated_goals on the LLM response and
-- the old RPC will silently no-op the field.

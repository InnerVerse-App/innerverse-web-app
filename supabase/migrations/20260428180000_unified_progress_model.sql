-- Unified progress model — see src/lib/progress.ts for the runtime
-- decay logic. This migration adds the storage anchor for goal
-- decay and updates process_session_end to compute goal progress
-- deterministically from session-theme intensities (rather than
-- accepting the AI-emitted updated_goals[].progress_percent).
--
-- Sessions / mindset shifts / breakthroughs derive their progress
-- from elapsed time since creation (no schema change needed).
--
-- Goals:
--   * progress_percent stored value increases by sum of linked
--     theme intensities at each session end (capped at 100).
--   * last_engaged_at anchors the decay calculation. Practice
--     goals lose 1 point per 72h since last_engaged_at; milestone
--     goals don't decay.
-- Idempotent.

alter table public.goals
  add column if not exists last_engaged_at timestamptz;

-- Backfill: for goals that already have a last_session_id, derive
-- last_engaged_at from sessions.ended_at so existing demo data has
-- a sensible anchor for the decay clock.
update public.goals g
set last_engaged_at = s.ended_at
from public.sessions s
where g.last_engaged_at is null
  and g.last_session_id is not null
  and s.id = g.last_session_id
  and s.ended_at is not null;

-- v7.2 process_session_end. Diff from v7.1 (galaxy_name):
--   * updated_goals[].progress_percent is IGNORED (was: clamped 0-100
--     and stored). Goals are still updated for status, rationale,
--     contributors, suggested_next_step, but progress now flows from
--     session-theme intensities below.
--   * After the session_themes loop, sum each linked goal's
--     theme intensities and add to its progress_percent (cap 100).
--     Set last_engaged_at = session.ended_at for the decay anchor.
--   * Milestone vs practice distinction lives at read time
--     (decay or no), not in this RPC.

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
  v_session_ended_at timestamptz;
  v_delta_directness double precision;
  v_delta_warmth double precision;
  v_delta_challenge double precision;
  v_progress_raw bigint;
  v_progress smallint;
  v_score_raw bigint;
  v_self_disclosure smallint;
  v_cognitive_shift smallint;
  v_emotional_integration smallint;
  v_novelty smallint;
  v_coach_narrative text;
  v_score_rationales jsonb;
  v_theme_score_rationale text;
  v_theme_elem jsonb;
  v_theme_label text;
  v_theme_description text;
  v_theme_id uuid;
  v_theme_intensity smallint;
  v_theme_intensity_raw bigint;
  v_theme_direction text;
  v_theme_evidence text;
  v_theme_linked_goal_id uuid;
  v_theme_label_to_id jsonb := '{}'::jsonb;
  v_shift_elem jsonb;
  v_shift_text text;
  v_shift_content text;
  v_shift_evidence text;
  v_shift_combined_raw bigint;
  v_shift_combined smallint;
  v_shift_linked_label text;
  v_shift_linked_theme_id uuid;
  v_shift_contrib_sessions uuid[];
  v_shift_influence jsonb;
  v_bk_elem jsonb;
  v_bk_evidence text;
  v_bk_combined_raw bigint;
  v_bk_combined smallint;
  v_bk_linked_label text;
  v_bk_linked_theme_id uuid;
  v_bk_galaxy_name text;
  v_bk_direct_sessions uuid[];
  v_bk_contrib_shifts uuid[];
  v_bk_contrib_sessions uuid[];
  v_bk_influence jsonb;
  v_goal_elem jsonb;
  v_goal_id uuid;
  v_goal_status text;
  v_goal_rationale text;
  v_goal_next_step text;
  v_goal_contrib_sessions uuid[];
  v_goal_contrib_shifts uuid[];
  v_goal_contrib_breakthroughs uuid[];
begin
  v_progress_raw := nullif(p_analysis ->> 'progress_percent', '')::bigint;
  if v_progress_raw is null then
    v_progress := null;
  else
    v_progress := greatest(0, least(100, v_progress_raw))::smallint;
  end if;

  v_score_raw := nullif(p_analysis ->> 'self_disclosure_score', '')::bigint;
  v_self_disclosure := case when v_score_raw is null then null
    else greatest(0, least(10, v_score_raw))::smallint end;
  v_score_raw := nullif(p_analysis ->> 'cognitive_shift_score', '')::bigint;
  v_cognitive_shift := case when v_score_raw is null then null
    else greatest(0, least(10, v_score_raw))::smallint end;
  v_score_raw := nullif(p_analysis ->> 'emotional_integration_score', '')::bigint;
  v_emotional_integration := case when v_score_raw is null then null
    else greatest(0, least(10, v_score_raw))::smallint end;
  v_score_raw := nullif(p_analysis ->> 'novelty_score', '')::bigint;
  v_novelty := case when v_score_raw is null then null
    else greatest(0, least(10, v_score_raw))::smallint end;

  v_coach_narrative := nullif(left(p_analysis ->> 'coach_narrative', 8000), '');

  v_score_rationales := case
    when jsonb_typeof(p_analysis -> 'score_rationales') = 'object' then
      p_analysis -> 'score_rationales'
    else null
  end;

  update public.sessions
  set summary = p_analysis ->> 'session_summary',
      progress_summary_short = p_analysis ->> 'progress_summary_short',
      progress_percent = v_progress,
      coach_message = nullif(left(p_analysis ->> 'coach_message', 2000), ''),
      coach_narrative = v_coach_narrative,
      self_disclosure_score = v_self_disclosure,
      cognitive_shift_score = v_cognitive_shift,
      emotional_integration_score = v_emotional_integration,
      novelty_score = v_novelty,
      score_rationales = v_score_rationales,
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
  returning user_id, ended_at into v_user_id, v_session_ended_at;

  if v_user_id is null then
    return false;
  end if;

  -- session_themes[]
  if jsonb_typeof(p_analysis -> 'session_themes') = 'array' then
    for v_theme_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'session_themes') as t(value)
      where jsonb_typeof(value) = 'object'
    loop
      v_theme_label := nullif(trim(v_theme_elem ->> 'label'), '');
      if v_theme_label is null then
        continue;
      end if;
      v_theme_description := nullif(left(v_theme_elem ->> 'description', 2000), '');

      insert into public.themes (user_id, label, description)
      values (v_user_id, v_theme_label, v_theme_description)
      on conflict (user_id, lower(label)) do update set
        last_used_at = now(),
        description = coalesce(excluded.description, public.themes.description)
      returning id into v_theme_id;

      v_theme_label_to_id := v_theme_label_to_id
        || jsonb_build_object(lower(v_theme_label), v_theme_id::text);

      v_theme_intensity_raw := nullif(v_theme_elem ->> 'intensity', '')::bigint;
      if v_theme_intensity_raw is null then
        continue;
      end if;
      v_theme_intensity := greatest(0, least(10, v_theme_intensity_raw))::smallint;

      v_theme_direction := v_theme_elem ->> 'direction';
      if v_theme_direction not in ('forward', 'stuck', 'regression') then
        continue;
      end if;

      v_theme_evidence := nullif(left(v_theme_elem ->> 'evidence_quote', 2000), '');
      v_theme_score_rationale := nullif(left(v_theme_elem ->> 'score_rationale', 2000), '');

      begin
        v_theme_linked_goal_id := (v_theme_elem ->> 'linked_goal_id')::uuid;
      exception when invalid_text_representation then
        v_theme_linked_goal_id := null;
      end;
      if v_theme_linked_goal_id is not null then
        if not exists (
          select 1 from public.goals
          where id = v_theme_linked_goal_id and user_id = v_user_id
        ) then
          v_theme_linked_goal_id := null;
        end if;
      end if;

      insert into public.session_themes (
        session_id, theme_id, user_id, intensity, direction,
        evidence_quote, linked_goal_id, score_rationale
      )
      values (
        p_session_id, v_theme_id, v_user_id, v_theme_intensity,
        v_theme_direction, v_theme_evidence, v_theme_linked_goal_id,
        v_theme_score_rationale
      )
      on conflict (session_id, theme_id) do nothing;
    end loop;
  end if;

  -- mindset_shifts[]
  if jsonb_typeof(p_analysis -> 'mindset_shifts') = 'array' then
    for v_shift_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'mindset_shifts') as t(value)
    loop
      if jsonb_typeof(v_shift_elem) = 'string' then
        v_shift_text := trim(v_shift_elem #>> '{}');
        if length(v_shift_text) = 0 then
          continue;
        end if;
        insert into public.insights (user_id, session_id, content)
        values (v_user_id, p_session_id, v_shift_text);
        continue;
      end if;

      if jsonb_typeof(v_shift_elem) <> 'object' then
        continue;
      end if;

      v_shift_content := nullif(trim(v_shift_elem ->> 'content'), '');
      if v_shift_content is null then
        continue;
      end if;

      v_shift_evidence := nullif(left(v_shift_elem ->> 'evidence_quote', 2000), '');

      v_shift_combined_raw := nullif(v_shift_elem ->> 'combined_score', '')::bigint;
      v_shift_combined := case when v_shift_combined_raw is null then null
        else greatest(0, least(10, v_shift_combined_raw))::smallint end;

      v_shift_linked_label := nullif(v_shift_elem ->> 'linked_theme_label', '');
      v_shift_linked_theme_id := null;
      if v_shift_linked_label is not null then
        begin
          v_shift_linked_theme_id := (v_theme_label_to_id ->> lower(v_shift_linked_label))::uuid;
        exception when invalid_text_representation then
          v_shift_linked_theme_id := null;
        end;
      end if;

      v_shift_contrib_sessions := case
        when jsonb_typeof(v_shift_elem -> 'contributing_session_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_shift_elem -> 'contributing_session_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;

      v_shift_influence := case
        when jsonb_typeof(v_shift_elem -> 'influence_scores') = 'array' then
          coalesce(
            (select jsonb_object_agg(
              elem ->> 'target_id',
              greatest(0, least(100, (elem ->> 'score')::int))
            )
             from jsonb_array_elements(v_shift_elem -> 'influence_scores') elem
             where elem ->> 'target_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               and (elem ->> 'score') ~ '^-?[0-9]+$'),
            '{}'::jsonb
          )
        else '{}'::jsonb
      end;

      insert into public.insights (
        user_id, session_id, content, evidence_quote,
        combined_score, linked_theme_id,
        contributing_session_ids, influence_scores
      )
      values (
        v_user_id, p_session_id, v_shift_content, v_shift_evidence,
        v_shift_combined, v_shift_linked_theme_id,
        v_shift_contrib_sessions, v_shift_influence
      );
    end loop;
  end if;

  -- breakthroughs[]
  if jsonb_typeof(p_analysis -> 'breakthroughs') = 'array' then
    for v_bk_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'breakthroughs') as t(value)
      where jsonb_typeof(value) = 'object'
    loop
      if length(trim(coalesce(v_bk_elem ->> 'content', ''))) = 0 then
        continue;
      end if;

      v_bk_evidence := nullif(left(v_bk_elem ->> 'evidence_quote', 2000), '');

      v_bk_combined_raw := nullif(v_bk_elem ->> 'combined_score', '')::bigint;
      v_bk_combined := case when v_bk_combined_raw is null then null
        else greatest(0, least(10, v_bk_combined_raw))::smallint end;

      v_bk_linked_label := nullif(v_bk_elem ->> 'linked_theme_label', '');
      v_bk_linked_theme_id := null;
      if v_bk_linked_label is not null then
        begin
          v_bk_linked_theme_id := (v_theme_label_to_id ->> lower(v_bk_linked_label))::uuid;
        exception when invalid_text_representation then
          v_bk_linked_theme_id := null;
        end;
      end if;

      v_bk_galaxy_name := nullif(left(trim(coalesce(v_bk_elem ->> 'galaxy_name', '')), 200), '');

      v_bk_direct_sessions := case
        when jsonb_typeof(v_bk_elem -> 'direct_session_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_bk_elem -> 'direct_session_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;
      v_bk_contrib_shifts := case
        when jsonb_typeof(v_bk_elem -> 'contributing_shift_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_bk_elem -> 'contributing_shift_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;
      v_bk_contrib_sessions := case
        when jsonb_typeof(v_bk_elem -> 'contributing_session_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_bk_elem -> 'contributing_session_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;
      v_bk_influence := case
        when jsonb_typeof(v_bk_elem -> 'influence_scores') = 'array' then
          coalesce(
            (select jsonb_object_agg(
              elem ->> 'target_id',
              greatest(0, least(100, (elem ->> 'score')::int))
            )
             from jsonb_array_elements(v_bk_elem -> 'influence_scores') elem
             where elem ->> 'target_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               and (elem ->> 'score') ~ '^-?[0-9]+$'),
            '{}'::jsonb
          )
        else '{}'::jsonb
      end;

      insert into public.breakthroughs (
        user_id, session_id, content, note,
        evidence_quote, combined_score, linked_theme_id, galaxy_name,
        direct_session_ids, contributing_shift_ids,
        contributing_session_ids, influence_scores
      )
      values (
        v_user_id, p_session_id,
        v_bk_elem ->> 'content',
        nullif(v_bk_elem ->> 'note', ''),
        v_bk_evidence, v_bk_combined, v_bk_linked_theme_id, v_bk_galaxy_name,
        v_bk_direct_sessions, v_bk_contrib_shifts,
        v_bk_contrib_sessions, v_bk_influence
      );
    end loop;
  end if;

  if jsonb_typeof(p_analysis -> 'recommended_next_steps') = 'array' then
    insert into public.next_steps (user_id, session_id, goal_id, content)
    select v_user_id, p_session_id, null, value
    from jsonb_array_elements_text(p_analysis -> 'recommended_next_steps')
    where length(trim(value)) > 0;
  end if;

  -- updated_goals[] — status / rationale / contributors / next_step
  -- only. progress_percent is NO LONGER read from the AI; it flows
  -- from the theme-rating sum below.
  if jsonb_typeof(p_analysis -> 'updated_goals') = 'array' then
    for v_goal_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'updated_goals') as t(value)
      where jsonb_typeof(value) = 'object'
    loop
      begin
        v_goal_id := (v_goal_elem ->> 'goal_id')::uuid;
      exception when invalid_text_representation then
        v_goal_id := null;
      end;
      if v_goal_id is null then
        continue;
      end if;

      v_goal_status := v_goal_elem ->> 'status';
      if v_goal_status not in ('not_started', 'on_track', 'at_risk') then
        continue;
      end if;

      v_goal_rationale := nullif(left(v_goal_elem ->> 'progress_rationale', 2000), '');
      v_goal_next_step := nullif(left(v_goal_elem ->> 'suggested_next_step', 2000), '');

      v_goal_contrib_sessions := case
        when jsonb_typeof(v_goal_elem -> 'contributing_session_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_goal_elem -> 'contributing_session_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;
      v_goal_contrib_shifts := case
        when jsonb_typeof(v_goal_elem -> 'contributing_shift_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_goal_elem -> 'contributing_shift_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;
      v_goal_contrib_breakthroughs := case
        when jsonb_typeof(v_goal_elem -> 'contributing_breakthrough_ids') = 'array' then
          coalesce(
            (select array_agg(value::uuid)
             from jsonb_array_elements_text(v_goal_elem -> 'contributing_breakthrough_ids')
             where value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
            '{}'::uuid[]
          )
        else '{}'::uuid[]
      end;

      update public.goals
      set status = v_goal_status,
          progress_rationale = v_goal_rationale,
          last_session_id = p_session_id,
          contributing_session_ids = (
            select array(
              select distinct val
              from unnest(contributing_session_ids || v_goal_contrib_sessions) as val
            )
          ),
          contributing_shift_ids = (
            select array(
              select distinct val
              from unnest(contributing_shift_ids || v_goal_contrib_shifts) as val
            )
          ),
          contributing_breakthrough_ids = (
            select array(
              select distinct val
              from unnest(contributing_breakthrough_ids || v_goal_contrib_breakthroughs) as val
            )
          )
      where id = v_goal_id
        and user_id = v_user_id
        and archived_at is null;

      if v_goal_next_step is not null and found then
        insert into public.next_steps (user_id, session_id, goal_id, content)
        values (v_user_id, p_session_id, v_goal_id, v_goal_next_step);
      end if;
    end loop;
  end if;

  -- Goal progression — the new deterministic rule. For each goal
  -- with at least one linked theme in this session, sum the linked
  -- theme intensities (1-10 each), CAP THE PER-SESSION DELTA AT 10
  -- (so a single session can never advance a goal by more than the
  -- intensity of one strong theme), then add to the existing
  -- progress_percent (cap 100). Bump last_engaged_at so the decay
  -- clock resets. Forward-compat: stuck/regression themes still
  -- count as engagement — just not as fast progress.
  --
  -- We use coalesce() so a goal with a fresh row (no progress yet)
  -- starts the increment from 0.
  update public.goals g
  set progress_percent = least(
        100,
        coalesce(g.progress_percent, 0) + least(10, sub.delta)
      )::smallint,
      last_engaged_at = coalesce(v_session_ended_at, now())
  from (
    select linked_goal_id, sum(intensity)::int as delta
    from public.session_themes
    where session_id = p_session_id
      and linked_goal_id is not null
      and intensity is not null
    group by linked_goal_id
  ) sub
  where g.id = sub.linked_goal_id
    and g.user_id = v_user_id
    and g.archived_at is null;

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

grant execute on function public.process_session_end(uuid, jsonb) to authenticated;
grant execute on function public.process_session_end(uuid, jsonb) to service_role;

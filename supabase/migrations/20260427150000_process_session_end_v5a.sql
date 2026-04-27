-- Session-end RPC update — V.5a wiring.
--
-- Reads the new fields emitted by prompt-session-end-v6:
--   - sessions sub-scores (self_disclosure, cognitive_shift,
--     emotional_integration, novelty)
--   - coach_narrative (the streamed coach-voiced summary)
--   - session_themes[] (the per-session crumb trail; upserts into
--     themes + writes session_themes rows)
--   - mindset_shifts[] is now an array of OBJECTS with content,
--     evidence_quote, contributing_session_ids[], influence_scores,
--     combined_score, linked_theme_label (resolved to linked_theme_id
--     via the same per-session theme upsert)
--   - breakthroughs[] adds direct_session_ids[],
--     contributing_shift_ids[], contributing_session_ids[],
--     evidence_quote, influence_scores, combined_score,
--     linked_theme_label
--   - updated_goals[] adds contributing_session_ids[],
--     contributing_shift_ids[], contributing_breakthrough_ids[],
--     completion_detected (sets goals.completed_at when both
--     completion_detected=true AND the user later confirms — for
--     now we set completed_at directly when the AI flags it; the
--     user-confirms step lives in the post-session UI's Call 2.
--     Actually, NO: the AI's claim of completion shouldn't set
--     completed_at until the user agrees. Leaving completed_at
--     NULL here; the post-session UI is responsible for setting it
--     after user confirmation. The flag travels back to the UI via
--     a separate channel.)
--
-- Forward-compat: every new field is read defensively. When the
-- prompt is still v5 (no new fields), every new branch is skipped
-- silently and the RPC behaves exactly as before. So this migration
-- is safe to land before the TS-side prompt switch.
--
-- Backward-compat for the shifts shape: v5 emits mindset_shifts[]
-- as an array of strings; v6 emits it as an array of objects. The
-- RPC handles both — when an element is a string, it's wrapped as
-- { content: <string> } with empty contributor arrays.
--
-- Theme upsert: themes are unique on (user_id, lower(label)). We
-- ON CONFLICT DO UPDATE to bump last_used_at and (re)set the
-- description if the AI provides one. This keeps the user's theme
-- vocabulary stable across sessions while letting the AI refine
-- descriptions over time.

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
  v_score_raw bigint;
  v_self_disclosure smallint;
  v_cognitive_shift smallint;
  v_emotional_integration smallint;
  v_novelty smallint;
  v_coach_narrative text;
  -- Per-iteration variables for session_themes / shifts /
  -- breakthroughs / goals loops.
  v_theme_elem jsonb;
  v_theme_label text;
  v_theme_description text;
  v_theme_id uuid;
  v_theme_intensity smallint;
  v_theme_intensity_raw bigint;
  v_theme_direction text;
  v_theme_evidence text;
  v_theme_linked_goal_id uuid;
  -- Per-session theme labels → ids, populated as we walk
  -- session_themes[]. Used when shifts / breakthroughs reference a
  -- linked_theme_label.
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
  v_bk_direct_sessions uuid[];
  v_bk_contrib_shifts uuid[];
  v_bk_contrib_sessions uuid[];
  v_bk_influence jsonb;
  v_goal_elem jsonb;
  v_goal_id uuid;
  v_goal_status text;
  v_goal_progress_raw bigint;
  v_goal_progress smallint;
  v_goal_rationale text;
  v_goal_next_step text;
  v_goal_contrib_sessions uuid[];
  v_goal_contrib_shifts uuid[];
  v_goal_contrib_breakthroughs uuid[];
begin
  -- ----------------------------------------------------------------
  -- Session UPDATE — adds the four sub-scores + coach_narrative.
  -- ----------------------------------------------------------------
  v_progress_raw := nullif(p_analysis ->> 'progress_percent', '')::bigint;
  if v_progress_raw is null then
    v_progress := null;
  else
    v_progress := greatest(0, least(100, v_progress_raw))::smallint;
  end if;

  -- Each sub-score: nullable, clamped to 0..10. NULL when the
  -- prompt didn't emit it (v5) OR when it was an invalid value.
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

  -- ----------------------------------------------------------------
  -- session_themes[] — upsert themes, insert per-session rows.
  -- ----------------------------------------------------------------
  -- Order matters: walk session_themes FIRST so v_theme_label_to_id
  -- is populated before shifts / breakthroughs reference it via
  -- linked_theme_label.
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

      -- Upsert the theme. last_used_at always bumps; description
      -- updates only when the AI provides one (don't blank out an
      -- existing description on a session that didn't specify).
      insert into public.themes (user_id, label, description)
      values (v_user_id, v_theme_label, v_theme_description)
      on conflict (user_id, lower(label)) do update set
        last_used_at = now(),
        description = coalesce(excluded.description, public.themes.description)
      returning id into v_theme_id;

      -- Map keys are lowercased so a shift / breakthrough that
      -- references the theme with slightly different casing
      -- (realistic LLM drift within a single response) still links
      -- correctly. The themes table is unique on (user_id,
      -- lower(label)) so case-folded keys are guaranteed unique
      -- within this map too.
      v_theme_label_to_id := v_theme_label_to_id
        || jsonb_build_object(lower(v_theme_label), v_theme_id::text);

      -- Intensity: clamp 0..10. NULL → skip the row entirely.
      v_theme_intensity_raw := nullif(v_theme_elem ->> 'intensity', '')::bigint;
      if v_theme_intensity_raw is null then
        continue;
      end if;
      v_theme_intensity := greatest(0, least(10, v_theme_intensity_raw))::smallint;

      -- Direction enum guard.
      v_theme_direction := v_theme_elem ->> 'direction';
      if v_theme_direction not in ('forward', 'stuck', 'regression') then
        continue;
      end if;

      v_theme_evidence := nullif(left(v_theme_elem ->> 'evidence_quote', 2000), '');

      -- Optional linked_goal_id — validate UUID + ownership.
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
        evidence_quote, linked_goal_id
      )
      values (
        p_session_id, v_theme_id, v_user_id, v_theme_intensity,
        v_theme_direction, v_theme_evidence, v_theme_linked_goal_id
      )
      on conflict (session_id, theme_id) do nothing;
    end loop;
  end if;

  -- ----------------------------------------------------------------
  -- mindset_shifts[] — handles BOTH v5 (string) and v6 (object).
  -- ----------------------------------------------------------------
  if jsonb_typeof(p_analysis -> 'mindset_shifts') = 'array' then
    for v_shift_elem in
      select value
      from jsonb_array_elements(p_analysis -> 'mindset_shifts') as t(value)
    loop
      -- v5 backward-compat: string element → wrap as { content: ... }
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

      -- Resolve linked_theme_label → linked_theme_id via the
      -- per-session map populated above.
      v_shift_linked_label := nullif(v_shift_elem ->> 'linked_theme_label', '');
      v_shift_linked_theme_id := null;
      if v_shift_linked_label is not null then
        begin
          v_shift_linked_theme_id := (v_theme_label_to_id ->> lower(v_shift_linked_label))::uuid;
        exception when invalid_text_representation then
          v_shift_linked_theme_id := null;
        end;
      end if;

      -- contributing_session_ids[]: array of UUIDs. Defensive cast.
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
        when jsonb_typeof(v_shift_elem -> 'influence_scores') = 'object'
        then v_shift_elem -> 'influence_scores'
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

  -- ----------------------------------------------------------------
  -- breakthroughs[] — same evidence-trail pattern + the layered DAG
  -- arrays the constellation tree relies on.
  -- ----------------------------------------------------------------
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
        when jsonb_typeof(v_bk_elem -> 'influence_scores') = 'object'
        then v_bk_elem -> 'influence_scores'
        else '{}'::jsonb
      end;

      insert into public.breakthroughs (
        user_id, session_id, content, note,
        evidence_quote, combined_score, linked_theme_id,
        direct_session_ids, contributing_shift_ids,
        contributing_session_ids, influence_scores
      )
      values (
        v_user_id, p_session_id,
        v_bk_elem ->> 'content',
        nullif(v_bk_elem ->> 'note', ''),
        v_bk_evidence, v_bk_combined, v_bk_linked_theme_id,
        v_bk_direct_sessions, v_bk_contrib_shifts,
        v_bk_contrib_sessions, v_bk_influence
      );
    end loop;
  end if;

  -- ----------------------------------------------------------------
  -- recommended_next_steps — unchanged from prior RPC.
  -- ----------------------------------------------------------------
  if jsonb_typeof(p_analysis -> 'recommended_next_steps') = 'array' then
    insert into public.next_steps (user_id, session_id, goal_id, content)
    select v_user_id, p_session_id, null, value
    from jsonb_array_elements_text(p_analysis -> 'recommended_next_steps')
    where length(trim(value)) > 0;
  end if;

  -- ----------------------------------------------------------------
  -- updated_goals[] — adds contributor arrays. Note: completion is
  -- DETECTED here (completion_detected=true on the entry) but the
  -- goals.completed_at column is NOT set by the RPC. The post-
  -- session UI's Call 2 (response-parser) is responsible for asking
  -- the user to confirm completion before flipping the column.
  -- For now we still write progress_percent; a 100% goal that the
  -- user later confirms goes from "active at 100%" → "completed".
  -- ----------------------------------------------------------------
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

      v_goal_progress_raw := nullif(v_goal_elem ->> 'progress_percent', '')::bigint;
      if v_goal_progress_raw is null then
        v_goal_progress := null;
      else
        v_goal_progress := greatest(0, least(100, v_goal_progress_raw))::smallint;
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

      -- UPDATE the goal. Defensive WHERE keeps cross-user goal_ids
      -- from writing through under service_role (cron path).
      -- Contributor arrays UNION-merge with the existing values via
      -- array || (set difference avoids duplicates) — each session
      -- adds its evidence trail without clobbering prior sessions'.
      update public.goals
      set status = v_goal_status,
          progress_percent = v_goal_progress,
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

  -- ----------------------------------------------------------------
  -- Style calibration deltas — unchanged.
  -- ----------------------------------------------------------------
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

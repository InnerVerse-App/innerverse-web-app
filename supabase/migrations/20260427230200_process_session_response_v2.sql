-- V.7 update to Call 2 (response-parser) — adds disagreed_themes
-- handling to process_session_response.
--
-- v1 only handled disagreement on insights and breakthroughs. v2
-- adds a third array, disagreed_themes, that flags
-- session_themes.user_disagreed_at + user_disagreement_note for
-- the matching theme rows on this session. Mirrors the existing
-- shift/breakthrough handling exactly.
--
-- Forward-compat: the new array is optional. v1-shape inputs (no
-- disagreed_themes key) still work unchanged.

create or replace function public.process_session_response(
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
  v_already_parsed timestamptz;
  v_disagreed_elem jsonb;
  v_disagreed_id uuid;
  v_disagreed_id_text text;
  v_disagreed_note text;
  c_uuid_re constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  select s.user_id, s.response_parsed_at
    into v_user_id, v_already_parsed
    from public.sessions s
   where s.id = p_session_id;

  if v_user_id is null then
    raise exception 'process_session_response: session not found %', p_session_id;
  end if;

  if v_already_parsed is not null then
    return false;
  end if;

  -- V.7: disagreed_themes — scope to session_themes rows belonging
  -- to this user AND this session. The id matched is a
  -- session_themes.id (not themes.id) so a disagreement is per-
  -- session-instance, not durable across sessions.
  if jsonb_typeof(p_analysis->'disagreed_themes') = 'array' then
    for v_disagreed_elem in
      select * from jsonb_array_elements(p_analysis->'disagreed_themes')
    loop
      v_disagreed_id_text := v_disagreed_elem->>'id';
      if v_disagreed_id_text is null
         or v_disagreed_id_text !~ c_uuid_re then
        continue;
      end if;
      v_disagreed_id := v_disagreed_id_text::uuid;
      v_disagreed_note := nullif(
        left(trim(coalesce(v_disagreed_elem->>'note', '')), 500),
        ''
      );

      update public.session_themes
         set user_disagreed_at = now(),
             user_disagreement_note = v_disagreed_note
       where id = v_disagreed_id
         and user_id = v_user_id
         and session_id = p_session_id
         and user_disagreed_at is null;
    end loop;
  end if;

  -- Disagreed shifts (unchanged from v1).
  if jsonb_typeof(p_analysis->'disagreed_shifts') = 'array' then
    for v_disagreed_elem in
      select * from jsonb_array_elements(p_analysis->'disagreed_shifts')
    loop
      v_disagreed_id_text := v_disagreed_elem->>'id';
      if v_disagreed_id_text is null
         or v_disagreed_id_text !~ c_uuid_re then
        continue;
      end if;
      v_disagreed_id := v_disagreed_id_text::uuid;
      v_disagreed_note := nullif(
        left(trim(coalesce(v_disagreed_elem->>'note', '')), 500),
        ''
      );

      update public.insights
         set user_disagreed_at = now(),
             user_disagreement_note = v_disagreed_note
       where id = v_disagreed_id
         and user_id = v_user_id
         and session_id = p_session_id
         and user_disagreed_at is null;
    end loop;
  end if;

  -- Disagreed breakthroughs (unchanged from v1).
  if jsonb_typeof(p_analysis->'disagreed_breakthroughs') = 'array' then
    for v_disagreed_elem in
      select * from jsonb_array_elements(p_analysis->'disagreed_breakthroughs')
    loop
      v_disagreed_id_text := v_disagreed_elem->>'id';
      if v_disagreed_id_text is null
         or v_disagreed_id_text !~ c_uuid_re then
        continue;
      end if;
      v_disagreed_id := v_disagreed_id_text::uuid;
      v_disagreed_note := nullif(
        left(trim(coalesce(v_disagreed_elem->>'note', '')), 500),
        ''
      );

      update public.breakthroughs
         set user_disagreed_at = now(),
             user_disagreement_note = v_disagreed_note
       where id = v_disagreed_id
         and user_id = v_user_id
         and session_id = p_session_id
         and user_disagreed_at is null;
    end loop;
  end if;

  update public.sessions
     set response_parsed_at = now()
   where id = p_session_id
     and response_parsed_at is null;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.process_session_response(uuid, jsonb)
  is 'V.7 Call 2 — apply user_response_text disagreements to session_themes / insights / breakthroughs. Idempotent.';

grant execute on function public.process_session_response(uuid, jsonb) to authenticated;
grant execute on function public.process_session_response(uuid, jsonb) to service_role;

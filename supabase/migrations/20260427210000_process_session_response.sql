-- Call 2 (response-parser) RPC — V.5a chunk D-2.
--
-- Applies the user's free-text reflection back onto the prior
-- analysis. For now the only adjustment supported is "user
-- disagreed with this claim" — emitted by prompt-session-response-v1
-- as { disagreed_shifts: [{id, note}], disagreed_breakthroughs: [{id, note}] }.
--
-- Future expansions (score recalibration, goal completion confirm)
-- will layer on as additional fields read from p_analysis. The RPC
-- ignores unrecognized top-level fields silently so a forward-compat
-- prompt that emits new shapes won't break a deployment that hasn't
-- yet been updated.
--
-- Idempotency: the RPC sets sessions.response_parsed_at and uses
-- `WHERE response_parsed_at IS NULL` as the guard. A second invocation
-- (cron retry, action-fire racing the cron) is a safe no-op.
--
-- Returns true if this call did the work, false if response was
-- already parsed.

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
  -- Tightened UUID regex (matches v5a RPC). Anything that doesn't
  -- look like a real UUID is silently skipped — the AI very
  -- occasionally fabricates ids and we don't want a malformed
  -- entry to fail the whole call.
  c_uuid_re constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  -- Resolve the session's owner via the security-invoker call
  -- context. RLS already enforces that the caller can only see
  -- their own sessions; this read just gives us the user_id we
  -- need for the audit trail and to scope the disagreement updates
  -- (defense-in-depth — the per-table RLS would catch a cross-user
  -- update too, but spelling it out keeps intent obvious).
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

  -- Disagreed shifts. Each entry sets user_disagreed_at + note on
  -- the matching insights row. We require the row to belong to the
  -- same user AND to this session, so a hallucinated id from
  -- another session can't accidentally flag a different shift as
  -- disagreed.
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
      -- Clamp to 500 chars defensively — the prompt asks for ~150 but
      -- a misbehaving prompt-vN could write multi-KB blobs. Matches
      -- the same defense pattern v5a uses on coach_narrative.
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

  -- Disagreed breakthroughs — same pattern.
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

  -- Mark the session as parsed. The conditional UPDATE re-checks the
  -- guard inside the same statement to close any race window between
  -- the SELECT above and now.
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
  is 'V.5a Call 2 — apply user_response_text disagreements back to insights / breakthroughs. Idempotent; returns true on first successful application, false on subsequent calls.';

-- security invoker means the JWT's role still needs execute on the
-- function. Both `authenticated` (action-fired path) and `service_role`
-- (future cron-recovery path) need access; granting both now avoids
-- a silent permission-denied bug when the cron PR lands.
grant execute on function public.process_session_response(uuid, jsonb) to authenticated;
grant execute on function public.process_session_response(uuid, jsonb) to service_role;

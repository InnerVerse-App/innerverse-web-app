-- Adds an optional user-editable title for a session that supersedes
-- the LLM-generated progress_summary_short in the UI. Lets the user
-- rename a session that has a default title they don't like, AND
-- gives them a workaround for sessions stuck on "Summary pending"
-- (analysis cron failed). Display fallback chain becomes
-- user_title -> progress_summary_short -> summary -> generic placeholder.

alter table public.sessions
  add column if not exists user_title text
    check (
      user_title is null
      or (length(trim(user_title)) > 0 and length(user_title) <= 200)
    );

comment on column public.sessions.user_title is
  'Optional user-set title that overrides progress_summary_short in the UI. Trimmed, max 200 chars. NULL means use the auto-generated title.';

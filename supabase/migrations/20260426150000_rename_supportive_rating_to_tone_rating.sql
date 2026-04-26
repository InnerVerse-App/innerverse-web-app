-- Rename session_feedback.supportive_rating → tone_rating.
--
-- The third feedback slider was repurposed from "How supportive did
-- this session feel?" (1=bad, 5=good) to "How would you rate your
-- coach's tone?" (1=too direct, 5=too warm). The column name is now
-- misleading — the value is no longer a "supportiveness" score but a
-- tone-direction marker where 3 is the desired middle.
--
-- Old-scale rows are nulled out so the new tone-direction analytics
-- start clean (3 rows of pre-rename test feedback existed at the time
-- of this migration; downstream readers would have misinterpreted them
-- under the new scale).

alter table public.session_feedback
  rename column supportive_rating to tone_rating;

update public.session_feedback
  set tone_rating = null
  where tone_rating is not null;

-- Drop and recreate the row-content guard so it references the new
-- column name. Postgres has no atomic "rename inside check" — re-issue.
alter table public.session_feedback
  drop constraint session_feedback_has_content;

alter table public.session_feedback
  add constraint session_feedback_has_content check (
    reflection is not null
    or tone_rating is not null
    or helpful_rating is not null
    or aligned_rating is not null
    or additional_feedback is not null
  );

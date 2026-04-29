-- Restores per-session feedback capture (sliders + private reflection)
-- that was deleted when the narrative-confirmation flow replaced the
-- old FeedbackForm in commit 1fb2028. The narrative flow stays — these
-- columns live alongside `user_response_text` so a single submit on the
-- wrap-up screen captures everything.
--
-- Aggregator (separate PR) reads the last ~5 sessions' values, updates
-- public.coaching_state.{directness, warmth, challenge, recent_style_
-- feedback}, and the next session's profile carries the calibration
-- forward. Nothing in v11.3 references these columns directly — the
-- coach absorbs the natural-language `recent_style_feedback` summary
-- the aggregator emits.

alter table public.sessions
  add column if not exists aligned_rating smallint,
  add column if not exists helpful_rating smallint,
  add column if not exists tone_rating smallint,
  add column if not exists session_reflection text;

-- 1..5 sliders. NULL means the user submitted without engaging with
-- this specific slider — the aggregator should treat NULL as "no
-- signal" rather than "neutral 3" so a user who only moved one slider
-- doesn't drag the others toward the middle.
alter table public.sessions
  drop constraint if exists sessions_aligned_rating_range,
  add constraint sessions_aligned_rating_range
    check (aligned_rating is null or aligned_rating between 1 and 5);

alter table public.sessions
  drop constraint if exists sessions_helpful_rating_range,
  add constraint sessions_helpful_rating_range
    check (helpful_rating is null or helpful_rating between 1 and 5);

alter table public.sessions
  drop constraint if exists sessions_tone_rating_range,
  add constraint sessions_tone_rating_range
    check (tone_rating is null or tone_rating between 1 and 5);

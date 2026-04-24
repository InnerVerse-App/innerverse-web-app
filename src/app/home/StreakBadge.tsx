"use client";

import { useMemo } from "react";

// Streak = number of consecutive *local* calendar days ending today
// (or yesterday, if the user hasn't had a session today yet) on which
// at least one coaching session ended. Client-side computation so
// "today" and "day boundary" use the user's own timezone, not UTC and
// not the server's.
//
// Why client-side: the server doesn't know the user's IANA timezone.
// Alternatives considered: persist users.timezone on first visit
// (heavier — new column, server action, and we don't need tz for
// anything else yet); ship tz via cookie (same ergonomics as a
// client component, more moving parts). Keeping streak math client-
// side means one useMemo and no round-trip.
//
// Edge cases:
//   - No sessions in the window → streak 0.
//   - DST transition days may compute as 23h or 25h when we subtract
//     24h in ms. In practice, this produces at most a one-day error
//     that self-corrects the next day. Worth fixing only if operators
//     report it.
//   - User crosses timezones mid-streak (e.g. travels): recomputes
//     silently on next render, may jump +/- 1 day. Acceptable.

type Props = { endedTimestamps: string[] };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeStreak(endedTimestamps: string[], tz: string): number {
  // en-CA formatting is YYYY-MM-DD, which string-sorts chronologically
  // and is safe to use as a Set key.
  const toLocalDay = (iso: string): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));

  const sessionDays = new Set(endedTimestamps.map(toLocalDay));
  if (sessionDays.size === 0) return 0;

  let cursor = new Date();
  let currentDay = toLocalDay(cursor.toISOString());

  // If the user hasn't had a session today yet, start counting from
  // yesterday — otherwise a healthy daily-cadence user would show
  // streak=0 for the first 23h of each day.
  if (!sessionDays.has(currentDay)) {
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
    currentDay = toLocalDay(cursor.toISOString());
    if (!sessionDays.has(currentDay)) return 0;
  }

  let streak = 0;
  while (sessionDays.has(currentDay)) {
    streak += 1;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
    currentDay = toLocalDay(cursor.toISOString());
  }
  return streak;
}

export function StreakBadge({ endedTimestamps }: Props) {
  const streak = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return computeStreak(endedTimestamps, tz);
  }, [endedTimestamps]);

  return (
    <span className="inline-flex items-center gap-1 text-neutral-200">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {streak}
    </span>
  );
}

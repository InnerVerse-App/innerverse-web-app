"use client";

// Streak is computed client-side so day boundaries use the user's
// browser timezone rather than UTC or the server's timezone.
//
// Known edge cases (acceptable, not worth fixing unless reported):
//   - DST transitions: subtracting 24h in ms on the transition day
//     can produce a one-day error that self-corrects the next day.
//   - User crosses timezones mid-streak: recomputes on next render,
//     may jump ±1 day.

type Props = { endedTimestamps: string[] };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeStreak(endedTimestamps: string[], tz: string): number {
  // en-CA yields YYYY-MM-DD — sorts chronologically and is safe as a Set key.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const toLocalDay = (d: Date): string => formatter.format(d);

  const sessionDays = new Set(
    endedTimestamps.map((iso) => toLocalDay(new Date(iso))),
  );
  if (sessionDays.size === 0) return 0;

  let cursor = new Date();
  let currentDay = toLocalDay(cursor);

  // If no session today yet, start from yesterday so a daily-cadence
  // user doesn't show streak=0 for the first 23h of each day.
  if (!sessionDays.has(currentDay)) {
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
    currentDay = toLocalDay(cursor);
    if (!sessionDays.has(currentDay)) return 0;
  }

  let streak = 0;
  while (sessionDays.has(currentDay)) {
    streak += 1;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
    currentDay = toLocalDay(cursor);
  }
  return streak;
}

export function StreakBadge({ endedTimestamps }: Props) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const streak = computeStreak(endedTimestamps, tz);

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

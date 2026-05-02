// No "use server" / "use client" so both the client composer and the
// server action / lib can share these caps. The schema's CHECK only
// enforces non-empty content; these caps are enforced at the server
// action layer (rejected as 400 if exceeded) and surfaced as soft
// hints in the UI.
//
// Note on units: counts are by Unicode code point (what a user
// would call a "character"), counted via Array.from(str).length —
// not by UTF-16 code units (what str.length returns). An emoji
// counts as 1, not 2. Truncation in actions.ts uses the same
// code-point-aware path so a surrogate pair near the cap can't be
// split into a lone surrogate.

// Hard cap on entry content length, enforced at the server-action
// boundary. Prevents accidental runaway prompt costs when a user
// shares a long entry into a session.
export const MAX_ENTRY_CONTENT_CHARS = 10_000;

// Soft hint shown to the user as a counter in the composer. Going
// over still saves up to MAX_ENTRY_CONTENT_CHARS; the hint is a
// "this is getting long" nudge.
export const SOFT_ENTRY_CONTENT_CHARS = 5_000;

// Cap on title length. Titles are optional and meant to be a few
// words at most; a 200-character ceiling is generous.
export const MAX_ENTRY_TITLE_CHARS = 200;

// True when a string exceeds the cap by code-point count. Used by
// the server action to reject over-cap submissions instead of
// silently truncating — a paste-via-dev-tools or scripted submit
// gets a clean 400 back rather than losing its tail without notice.
export function exceedsCap(str: string, maxLength: number): boolean {
  // Cheap path: code-unit length already inside cap → safe regardless
  // of code-point count.
  if (str.length <= maxLength) return false;
  // Need a code-point count. Iterator iterates by code point.
  const iter = str[Symbol.iterator]();
  let count = 0;
  while (!iter.next().done) {
    count++;
    if (count > maxLength) return true;
  }
  return false;
}

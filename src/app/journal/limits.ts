// No "use server" / "use client" so both the client composer and the
// server action / lib can share these caps. The schema's CHECK only
// enforces non-empty content; these caps are enforced at the server
// action layer (truncation) and surfaced as soft hints in the UI.

// Hard cap on entry content length, enforced at the server-action
// boundary. Going over this gets truncated server-side before
// insert/update. Prevents accidental runaway prompt costs when a
// user shares a long entry into a session.
export const MAX_ENTRY_CONTENT_CHARS = 10_000;

// Soft hint shown to the user as a character counter in the composer.
// Going over still saves (up to MAX_ENTRY_CONTENT_CHARS); the hint
// is just a "this is getting long" nudge.
export const SOFT_ENTRY_CONTENT_CHARS = 5_000;

// Cap on title length. Titles are optional and meant to be a few
// words at most; a 200-char ceiling is generous.
export const MAX_ENTRY_TITLE_CHARS = 200;

// No "use server" / "use client" so both the client form and the
// server action can share these caps. Schema is unbounded; the
// server enforces these at write time.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;

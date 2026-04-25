// Soft caps on user-supplied form input for /goals/new.
//
// Lives in its own module (no "use server" / "use client") so both the
// client form (NewGoalForm.tsx) and the server action (actions.ts) can
// import the same source of truth — flagged by the 2026-04-25 audit
// (correctness MED + architecture MED) as a maintenance hazard when
// the constants were duplicated across both files.
//
// Schema doesn't enforce these (text columns are unbounded by design —
// see PR #70 audit ledger FINDING 12); the server action enforces them
// at write time so the LLM prompt budget and the Goals card layout
// stay sane.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;

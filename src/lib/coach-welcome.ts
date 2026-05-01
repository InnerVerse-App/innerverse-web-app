import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

// First-session-only welcome messages, one per coach. The file is
// read once at module init (same pattern as the prompt files in
// src/lib/coaching-prompt.ts) and parsed into a coach_value → text
// map. Empty / missing coach is handled by the caller — getCoachWelcome
// returns null and the start flow falls back to the dynamic opener.
//
// Source file: reference/coach_welcome_messages.md
//   - Sections are `## <coach_value>` (lowercase, matching
//     COACHES[].value in src/app/onboarding/data.ts).
//   - Body of each section is a single quoted paragraph. The wrapping
//     quotes are stripped here — they're a source-file convention
//     ("this is spoken text"), not part of what the coach says.

const SOURCE_PATH = path.join(
  process.cwd(),
  "reference",
  "coach_welcome_messages.md",
);

function loadWelcomes(): Map<string, string> {
  const raw = readFileSync(SOURCE_PATH, "utf8");
  const map = new Map<string, string>();
  const sections = raw.split(/^## /m);
  // sections[0] is the file preamble (the H1 + intro text); skip it.
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;
    const coachValue = section.slice(0, newlineIdx).trim().toLowerCase();
    let body = section.slice(newlineIdx + 1).trim();
    if (body.startsWith('"') && body.endsWith('"')) {
      body = body.slice(1, -1).trim();
    }
    if (coachValue && body) map.set(coachValue, body);
  }
  return map;
}

const WELCOMES = loadWelcomes();

export function getCoachWelcome(
  coachValue: string | null | undefined,
): string | null {
  if (!coachValue) return null;
  return WELCOMES.get(coachValue.toLowerCase()) ?? null;
}

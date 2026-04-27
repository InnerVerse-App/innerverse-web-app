import Link from "next/link";

import { formatDateCompact } from "@/lib/format";

// Structured detail for an expanded card body. Each contributor
// (session, shift, breakthrough) carries a per-relationship snippet
// describing how it contributed to the parent item — not just a
// list of links. For real data this snippet will be LLM-generated at
// session-end and stored alongside each contributor link; demo
// derives it deterministically from a pool.
export type ExpandedDetail = {
  // One-line human framing for the body.
  narrative: string;
  // For mindset shifts only: a short line about what was noticed
  // that flagged this as a shift (the moment the user's pattern
  // visibly changed).
  noticedAt?: string;
  // Sessions that contributed, each with a per-relationship snippet
  // describing what happened in that session relative to this item.
  sessions: { id: string; endedAt: string; snippet: string }[];
  // Mindset shifts that contributed (relevant for breakthroughs and
  // goals — shifts themselves don't list sub-shifts).
  shifts: { id: string; content: string; snippet: string }[];
  // Breakthroughs that contributed (relevant for goals only).
  breakthroughs: { id: string; content: string; snippet: string }[];
};

const SHIFT_BULLET_COLOR = "#A78BFA";
const BREAKTHROUGH_BULLET_COLOR = "#DCA114";
const STAR_CLIP =
  "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";

// Renders the expanded body of a Progress / Goal card — narrative,
// optional "what was noticed" line, and the contributor lists with
// per-row snippets. Each session date links to its session detail
// page; shift / breakthrough rows show content as the headline with
// the snippet underneath.
export function ExpandedDetailBody({ detail }: { detail: ExpandedDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-neutral-300">
        {detail.narrative}
      </p>
      {detail.noticedAt ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            What was noticed
          </p>
          <p className="text-xs italic leading-relaxed text-neutral-300">
            &ldquo;{detail.noticedAt}&rdquo;
          </p>
        </div>
      ) : null}
      {detail.sessions.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Sessions
          </p>
          <ul className="flex flex-col gap-2">
            {detail.sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <Link
                  href={`/sessions/${s.id}`}
                  className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-neutral-300 transition hover:border-brand-primary/40 hover:text-brand-primary"
                >
                  {formatDateCompact(s.endedAt)}
                </Link>
                <span className="text-xs text-neutral-300">{s.snippet}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.shifts.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Mindset shifts that paved the way
          </p>
          <ul className="flex flex-col gap-2 text-xs">
            {detail.shifts.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: SHIFT_BULLET_COLOR }}
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="font-medium text-neutral-200">{s.content}</p>
                  <p className="mt-0.5 text-neutral-400">{s.snippet}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.breakthroughs.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Breakthroughs along the way
          </p>
          <ul className="flex flex-col gap-2 text-xs">
            {detail.breakthroughs.map((b) => (
              <li key={b.id} className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2 w-2 shrink-0"
                  style={{
                    background: BREAKTHROUGH_BULLET_COLOR,
                    clipPath: STAR_CLIP,
                  }}
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="font-medium text-neutral-200">{b.content}</p>
                  <p className="mt-0.5 text-neutral-400">{b.snippet}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

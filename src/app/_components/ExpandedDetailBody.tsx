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

const SHIFT_COLOR = "#A78BFA";
const BREAKTHROUGH_COLOR = "#DCA114";
const SESSION_COLOR = "#59A4C0"; // brand-primary hex equivalent
const STAR_CLIP =
  "polygon(50% 0%, 57.7% 31.5%, 85.4% 14.6%, 68.5% 42.3%, 100% 50%, 68.5% 57.7%, 85.4% 85.4%, 57.7% 68.5%, 50% 100%, 42.3% 68.5%, 14.6% 85.4%, 31.5% 57.7%, 0% 50%, 31.5% 42.3%, 14.6% 14.6%, 42.3% 31.5%)";

// Renders the expanded body of a Progress / Goal card — narrative,
// optional "what was noticed" line, and the contributor lists. Each
// contributor renders as a colored pill matching the badges on the
// session card (amber star for breakthroughs, purple brain for
// shifts, brand-primary chat icon for sessions).
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
      {detail.breakthroughs.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Breakthroughs along the way
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.breakthroughs.map((b) => (
              <Link
                key={b.id}
                href={`/progress?constellation=${b.id}#bt-${b.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition hover:border-brand-primary/40 hover:text-brand-primary"
                style={{
                  borderColor: "rgba(220,161,20,0.4)",
                  color: BREAKTHROUGH_COLOR,
                }}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0"
                  style={{ background: BREAKTHROUGH_COLOR, clipPath: STAR_CLIP }}
                  aria-hidden
                />
                {b.content}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {detail.shifts.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Mindset shifts that paved the way
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.shifts.map((s) => (
              <Link
                key={s.id}
                href={`/progress?shift=${s.id}#ms-${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition hover:border-brand-primary/40 hover:text-brand-primary"
                style={{
                  borderColor: "rgba(167,139,250,0.4)",
                  color: SHIFT_COLOR,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 shrink-0"
                  aria-hidden
                >
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                </svg>
                {s.content}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {detail.sessions.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Sessions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.sessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions?session=${s.id}#s-${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition hover:border-brand-primary/40 hover:text-brand-primary"
                style={{
                  borderColor: "rgba(89,164,192,0.4)",
                  color: SESSION_COLOR,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 shrink-0"
                  aria-hidden
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {formatDateCompact(s.endedAt)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

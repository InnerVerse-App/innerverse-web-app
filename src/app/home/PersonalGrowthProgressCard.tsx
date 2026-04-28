import Link from "next/link";

import { RecencyBar } from "@/app/_components/RecencyBar";

// Title falls back from first breakthrough's content → session's
// progress_summary_short → "Growth session" — our schema has no
// first-class "growth theme" field.

export type RecentGrowthItem = {
  sessionId: string;
  endedAt: string;
  title: string;
  note: string | null;
};

type Props = {
  items: RecentGrowthItem[];
  // Demo mode passes "/sessions?demo=1"; real passes "/sessions".
  // Each item links to that base + &session=<id>#s-<id> so tapping
  // a growth theme on Home jumps to the Sessions tab with that
  // session highlighted + auto-expanded.
  sessionsBase?: string;
};

export function PersonalGrowthProgressCard({
  items,
  sessionsBase = "/sessions",
}: Props) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-brand-primary"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.25" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
        <h2 className="text-lg font-semibold text-white">
          Personal Growth Progress
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Themes from your most recent sessions. Tap any to open the
        session.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Your growth progress will appear here after your first analyzed
          coaching session.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {items.map((item) => {
              const sep = sessionsBase.includes("?") ? "&" : "?";
              const href = `${sessionsBase}${sep}session=${item.sessionId}#s-${item.sessionId}`;
              return (
                <li key={item.sessionId}>
                  <Link
                    href={href}
                    className="block rounded-lg border border-transparent px-2 py-2 transition hover:border-brand-primary/30 hover:bg-white/5"
                  >
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <RecencyBar lastEngagedAt={item.endedAt} color="#59A4C0" />
                    {item.note ? (
                      <p className="mt-2 text-sm text-neutral-400">{item.note}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={sessionsBase}
            className="mt-5 block rounded-md border border-white/10 px-4 py-2 text-center text-sm text-brand-primary transition hover:border-brand-primary/40 hover:bg-white/5"
          >
            See more progress
          </Link>
        </>
      )}
    </section>
  );
}

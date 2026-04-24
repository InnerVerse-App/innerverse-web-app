import Link from "next/link";

// Title falls back from first breakthrough's content → session's
// progress_summary_short → "Growth session" — our schema has no
// first-class "growth theme" field.

export type RecentGrowthItem = {
  sessionId: string;
  progressPercent: number;
  title: string;
  note: string | null;
};

type Props = {
  items: RecentGrowthItem[];
};

export function PersonalGrowthProgressCard({ items }: Props) {
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
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Your growth progress will appear here after your first analyzed
          coaching session.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-5">
            {items.map((item) => (
              <li key={item.sessionId}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <span className="shrink-0 text-sm text-neutral-400">
                    {item.progressPercent}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-brand-primary"
                    style={{ width: `${item.progressPercent}%` }}
                    aria-hidden
                  />
                </div>
                {item.note ? (
                  <p className="mt-2 text-sm text-neutral-400">{item.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href="/progress"
            className="mt-5 block rounded-md border border-white/10 px-4 py-2 text-center text-sm text-brand-primary transition hover:border-brand-primary/40 hover:bg-white/5"
          >
            See more progress
          </Link>
        </>
      )}
    </section>
  );
}

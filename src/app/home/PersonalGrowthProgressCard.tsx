// Personal Growth Progress card — one row per recent completed session
// with progress_percent set. Each row surfaces a representative
// breakthrough from that session (title + note) paired with the
// session's progress %.
//
// Data interpretation: our schema doesn't have Bubble's "growth theme"
// concept as a first-class field. Closest honest mapping — use the
// first breakthrough's content as the row title and its note as the
// subtext. Sessions without breakthroughs fall back to
// progress_summary_short so the row is still meaningful. If that also
// isn't set yet (analysis pending), the session is filtered out
// upstream in HomePage's loadHomeData (WHERE progress_percent IS NOT
// NULL).

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
      )}
    </section>
  );
}

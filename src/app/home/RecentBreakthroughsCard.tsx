import { formatDateCompact } from "@/lib/format";

// Recent Breakthroughs card — the last N breakthroughs across all
// sessions, newest first. Matches the canonical layout from
// homescreen-5.jpeg: content in white, then a "MMM DD • note" footer
// in muted gray beneath. No progress bars, no percentages — just the
// named moment + date + downstream-implication subtext.
//
// Row count cap lives upstream in HomePage's BREAKTHROUGHS_LIMIT;
// this component is dumb about the slice. The Progress tab shows the
// full history.

export type RecentBreakthrough = {
  id: string;
  content: string;
  note: string | null;
  createdAt: string;
};

type Props = {
  items: RecentBreakthrough[];
};

export function RecentBreakthroughsCard({ items }: Props) {
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
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="14 7 21 7 21 14" />
        </svg>
        <h2 className="text-lg font-semibold text-white">
          Recent Breakthroughs
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Your recent breakthroughs will appear here after your first
          coaching session.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <p className="text-sm font-medium text-white">{item.content}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatDateCompact(item.createdAt)}
                {item.note ? ` • ${item.note}` : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

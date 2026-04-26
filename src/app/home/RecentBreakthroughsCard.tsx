import Link from "next/link";

import { formatDateCompact } from "@/lib/format";

export type RecentBreakthrough = {
  id: string;
  content: string;
  note: string | null;
  createdAt: string;
};

type Props = {
  items: RecentBreakthrough[];
  // Demo mode passes "/progress?demo=1"; real passes "/progress".
  // Each card links to that base + &constellation=<id>#constellation-map
  // so tapping a breakthrough lands on the Progress tab with that
  // breakthrough's constellation already selected.
  progressBase?: string;
};

export function RecentBreakthroughsCard({ items, progressBase = "/progress" }: Props) {
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
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => {
            const sep = progressBase.includes("?") ? "&" : "?";
            const href = `${progressBase}${sep}constellation=${item.id}#constellation-map`;
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className="block rounded-lg border border-transparent px-2 py-1.5 transition hover:border-brand-primary/30 hover:bg-white/5"
                >
                  <p className="text-sm font-medium text-white">{item.content}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDateCompact(item.createdAt)}
                    {item.note ? ` • ${item.note}` : null}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

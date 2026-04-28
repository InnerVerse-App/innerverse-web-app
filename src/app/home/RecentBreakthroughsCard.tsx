import Link from "next/link";

import { RecencyBar } from "@/app/_components/RecencyBar";
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
  // Each card links to that base + &constellation=<id>#bt-<id>
  // so tapping a breakthrough lands on the Progress tab with that
  // breakthrough's card highlighted + the page scrolled to it.
  progressBase?: string;
};

const BREAKTHROUGH_COLOR = "#DCA114";
const STAR_CLIP =
  "polygon(50% 0%, 57.7% 31.5%, 85.4% 14.6%, 68.5% 42.3%, 100% 50%, 68.5% 57.7%, 85.4% 85.4%, 57.7% 68.5%, 50% 100%, 42.3% 68.5%, 14.6% 85.4%, 31.5% 57.7%, 0% 50%, 31.5% 42.3%, 14.6% 14.6%, 42.3% 31.5%)";

export function RecentBreakthroughsCard({ items, progressBase = "/progress" }: Props) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-5 w-5 shrink-0"
          style={{ background: BREAKTHROUGH_COLOR, clipPath: STAR_CLIP }}
          aria-hidden
        />
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
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => {
            const sep = progressBase.includes("?") ? "&" : "?";
            const href = `${progressBase}${sep}constellation=${item.id}#bt-${item.id}`;
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className="block rounded-lg border border-transparent px-2 py-1.5 transition hover:border-brand-primary/30 hover:bg-white/5"
                >
                  <p className="text-sm font-medium text-white">{item.content}</p>
                  <RecencyBar
                    lastEngagedAt={item.createdAt}
                    color={BREAKTHROUGH_COLOR}
                  />
                  <p className="mt-1.5 text-xs text-neutral-500">
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

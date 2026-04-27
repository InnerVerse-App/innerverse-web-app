import type { ReactNode } from "react";

import { BottomNav } from "@/app/home/BottomNav";

type TabKey = "home" | "sessions" | "progress" | "goals" | "settings";

// The consistent outer shell for every signed-in Tier 1 + Tier 2
// screen that shows the bottom navigation: dark background, the
// single scroll region, constrained-width inner container, and the
// nav pinned to the bottom. New pages drop into this wrapper rather
// than re-scaffolding the flex column each time.
//
// `active` accepts null for sub-pages (e.g. /next-steps) that want
// the nav visible for navigation but aren't one of the five main
// tabs — nothing highlights as selected.
export function PageShell({
  active,
  children,
  navHrefSuffix = "",
}: {
  active: TabKey | null;
  children: ReactNode;
  // Demo-only: appended to every BottomNav href so `?demo=1` is
  // preserved across tab navigation. DROP BEFORE MERGE along with
  // the per-page demo escape hatches.
  navHrefSuffix?: string;
}) {
  return (
    // min-h-[100dvh] — dynamic viewport unit so the container tracks
    // the mobile browser chrome showing/hiding on scroll. `100vh`
    // here caused two visible bugs: the URL bar covered the bottom
    // nav, and scrolling made the layout jump as 100vh stayed
    // constant while the visible area resized.
    //
    // pb-24 on main — the BottomNav is now fixed to viewport bottom
    // (so it stays visible while content scrolls), which removes it
    // from the flex flow. Padding ensures the last card isn't
    // obscured under the nav.
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-10 sm:pb-28">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <BottomNav active={active} hrefSuffix={navHrefSuffix} />
    </div>
  );
}

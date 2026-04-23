import type { ReactNode } from "react";

import { BottomNav } from "@/app/home/BottomNav";

type TabKey = "home" | "sessions" | "progress" | "goals" | "settings";

// The consistent outer shell for every signed-in Tier 1 + Tier 2
// screen that shows the bottom navigation: dark background, the
// single scroll region, constrained-width inner container, and the
// nav pinned to the bottom. New pages drop into this wrapper rather
// than re-scaffolding the flex column each time.
export function PageShell({
  active,
  children,
}: {
  active: TabKey;
  children: ReactNode;
}) {
  return (
    // min-h-[100dvh] — dynamic viewport unit so the container tracks
    // the mobile browser chrome showing/hiding on scroll. `100vh`
    // here caused two visible bugs: the URL bar covered the bottom
    // nav, and scrolling made the layout jump as 100vh stayed
    // constant while the visible area resized.
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <BottomNav active={active} />
    </div>
  );
}

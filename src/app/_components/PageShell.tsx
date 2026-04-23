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
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <BottomNav active={active} />
    </div>
  );
}

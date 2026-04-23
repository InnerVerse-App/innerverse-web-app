import Link from "next/link";
import type { ReactNode } from "react";

import { BackArrowIcon } from "./icons";

// Header + content shell for the legal / support pages (/terms,
// /privacy, /support). Separate from PageShell because these pages
// don't show the bottom nav — they're navigated to from Settings
// and the only affordance is the back arrow.
export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/settings"
            aria-label="Back"
            className="rounded-md p-1 text-neutral-400 transition hover:bg-white/5 hover:text-white"
          >
            <BackArrowIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 text-sm leading-relaxed text-neutral-300">
          {children}
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";

type TabKey = "home" | "sessions" | "progress" | "goals" | "settings";

type Tab = {
  key: TabKey;
  label: string;
  href: string | null;
  icon: JSX.Element;
};

const TABS: Tab[] = [
  {
    key: "home",
    label: "Home",
    href: "/home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V21a.75.75 0 0 1-.75.75H15V15h-6v6.75H3.75A.75.75 0 0 1 3 21V10.5Z" />
      </svg>
    ),
  },
  {
    key: "sessions",
    label: "Sessions",
    href: "/sessions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
  {
    key: "progress",
    label: "Your InnerVerse",
    href: "/progress",
    // Galaxy / universe icon: a central core with a single broad
    // spiral arm sweeping around it, evoking the star map without
    // being literal.
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="h-6 w-6"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path
          strokeLinecap="round"
          d="M12 4.5c4.142 0 7.5 3.358 7.5 7.5 0 2.071-1.679 3.75-3.75 3.75-1.036 0-1.875-.84-1.875-1.875 0-.518.42-.938.938-.938"
        />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "goals",
    label: "Goals",
    href: "/goals",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5.25" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

// `active` may be null for non-tab pages that still want the bottom
// nav visible (e.g. /next-steps). A null active means no tab
// renders as selected — the nav is still there for navigation but
// no visual "you are here" highlight.
export function BottomNav({
  active,
  hrefSuffix = "",
}: {
  active: TabKey | null;
  // Appended to every tab href. Used by demo mode to preserve
  // ?demo=1 across navigation. DROP BEFORE MERGE along with the
  // demo escape hatches.
  hrefSuffix?: string;
}) {
  return (
    // fixed inset-x-0 bottom-0 z-20 — pin to viewport bottom so the
    // nav stays visible while the page scrolls. PageShell's main
    // element adds pb-24 so content isn't hidden underneath. Session
    // detail pages (src/app/sessions/[id]/page.tsx) render ChatView
    // instead of PageShell, so the nav is automatically hidden during
    // an active coaching session per the product requirement.
    //
    // pb-[env(safe-area-inset-bottom)] — pads past iOS home-indicator
    // safe area so the tab row isn't obscured on notched devices.
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/5 bg-brand-dark/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2 py-2">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const className =
            "flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs transition " +
            (isActive
              ? "text-brand-primary"
              : "text-neutral-500 hover:text-neutral-300");
          const content = (
            <>
              {tab.icon}
              <span>{tab.label}</span>
            </>
          );
          if (tab.href) {
            return (
              <Link
                key={tab.key}
                href={`${tab.href}${hrefSuffix}`}
                className={className}
              >
                {content}
              </Link>
            );
          }
          return (
            <button
              key={tab.key}
              type="button"
              disabled
              className={className + " cursor-not-allowed opacity-60"}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

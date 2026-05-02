import Link from "next/link";

// Visual sub-tab bar — /sessions and /journal are sibling routes (kept
// separate to avoid a /sessions/[id] dynamic-segment collision).
type Props = {
  active: "sessions" | "journal";
};

export function SessionsJournalTabBar({ active }: Props) {
  return (
    <nav
      aria-label="Sessions and Journal"
      className="mb-6 flex w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1"
    >
      <TabLink href="/sessions" label="Sessions" isActive={active === "sessions"} />
      <TabLink href="/journal" label="Journal" isActive={active === "journal"} />
    </nav>
  );
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        "flex-1 rounded-full px-4 py-2 text-center text-sm font-medium transition " +
        (isActive
          ? "bg-brand-primary text-brand-primary-contrast shadow-sm"
          : "text-neutral-300 hover:bg-white/5 hover:text-white")
      }
    >
      {label}
    </Link>
  );
}

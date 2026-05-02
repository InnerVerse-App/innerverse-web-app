import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { SessionsJournalTabBar } from "@/app/_components/SessionsJournalTabBar";
import { listEntries, type JournalEntry } from "@/lib/journal";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { JournalEntryListItem } from "./JournalEntryListItem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal" };

export default async function JournalPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const entries = await listEntries(ctx);

  return (
    <PageShell active="sessions">
      <h1 className="text-3xl font-bold text-white">Journal</h1>
      <p className="mt-1 text-sm text-neutral-400">
        A private writing space. Star an entry to bring it into your next
        session — or skip and keep it just for you.
      </p>
      <div className="mt-6">
        <SessionsJournalTabBar active="journal" />
      </div>

      <Link
        href="/journal/new"
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90 active:scale-[0.98]"
      >
        <span aria-hidden>+</span>
        New entry
      </Link>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {entries.map((entry: JournalEntry) => (
            <li key={entry.id}>
              <JournalEntryListItem entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
      <p className="text-sm text-neutral-400">
        No entries yet. Tap{" "}
        <span className="font-medium text-white">New entry</span> above to write
        your first thought.
      </p>
    </div>
  );
}

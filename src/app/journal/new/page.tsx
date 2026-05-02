import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";

import { EntryComposer } from "../EntryComposer";

export const dynamic = "force-dynamic";
export const metadata = { title: "New journal entry" };

export default async function NewJournalEntryPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  return (
    <PageShell active="sessions">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/journal"
          className="rounded px-2 py-1 text-sm text-neutral-400 transition hover:text-white"
        >
          ← Cancel
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-white">New entry</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Write what&apos;s on your mind. Tap the mic to speak it instead.
      </p>
      <EntryComposer mode="create" />
    </PageShell>
  );
}

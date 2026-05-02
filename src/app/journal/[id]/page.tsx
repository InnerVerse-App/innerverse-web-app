import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { formatDateTimeLong } from "@/lib/format";
import { getEntryById } from "@/lib/journal";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { EntryComposer } from "../EntryComposer";
import { EntryFlagToggle } from "./EntryFlagToggle";
import { EntryDeleteButton } from "./EntryDeleteButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal entry" };

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const entry = await getEntryById(ctx, id);
  if (!entry) notFound();

  const timestamp = formatDateTimeLong(entry.created_at);
  const wasEdited = entry.updated_at && entry.updated_at !== entry.created_at;

  return (
    <PageShell active="sessions">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/journal"
          className="rounded px-2 py-1 text-sm text-neutral-400 transition hover:text-white"
        >
          ← Journal
        </Link>
        <EntryDeleteButton entryId={entry.id} />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {entry.title?.trim() || timestamp}
          </h1>
          {entry.title?.trim() ? (
            <p className="mt-1 text-xs text-neutral-500">{timestamp}</p>
          ) : null}
          {wasEdited ? (
            <p className="mt-0.5 text-[11px] text-neutral-600">
              Edited {formatDateTimeLong(entry.updated_at)}
            </p>
          ) : null}
        </div>
        <EntryFlagToggle
          entryId={entry.id}
          flagged={entry.flagged_for_session}
        />
      </div>

      <EntryComposer
        mode="edit"
        entryId={entry.id}
        initial={{ title: entry.title, content: entry.content }}
      />
    </PageShell>
  );
}

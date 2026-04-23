import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

async function loadAccount(): Promise<{ name: string; email: string }> {
  // Prefer users.display_name (webhook-synced on Prod), fall back to
  // Clerk's firstName (covers Preview where the webhook isn't wired).
  const ctx = await supabaseForUser();
  let dbName: string | null = null;
  if (ctx) {
    const { data, error } = await ctx.client
      .from("users")
      .select("display_name, email")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) throw error;
    dbName = data?.display_name?.trim() ?? null;
  }

  const clerkUser = await currentUser();
  const name =
    dbName ||
    clerkUser?.firstName?.trim() ||
    clerkUser?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "friend";
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "";

  return { name, email };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const account = await loadAccount();

  return (
    <PageShell active="settings">
      <h1 className="text-3xl font-bold text-white">Settings</h1>
      <p className="mt-1 text-sm text-neutral-400">Manage your account.</p>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-base font-semibold text-white">Account</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Name</dt>
          <dd className="text-neutral-200">{account.name}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="break-all text-neutral-200">{account.email}</dd>
        </dl>
        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className="mt-5 w-full rounded-md border border-white/10 px-6 py-3 text-sm font-medium text-neutral-200 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </SignOutButton>
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-base font-semibold text-white">Legal &amp; support</h2>
        <ul className="mt-3 flex flex-col">
          <SettingsLink href="/support" label="Support" />
          <SettingsLink href="/terms" label="Terms of Service" />
          <SettingsLink href="/privacy" label="Privacy Policy" />
        </ul>
      </section>

      <p className="mt-8 text-center text-xs text-neutral-500">
        InnerVerse is in active development.
      </p>
    </PageShell>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between border-b border-white/5 py-3 text-sm text-neutral-200 transition last:border-b-0 hover:text-brand-primary"
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-neutral-500"
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>
    </li>
  );
}

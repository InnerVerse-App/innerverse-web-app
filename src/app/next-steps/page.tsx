import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getDisclaimerAcknowledgedAt,
  isDisclaimerAcknowledged,
} from "@/lib/disclaimer";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { NextStepRow } from "./NextStepRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Next Steps" };

type NextStepDbRow = {
  id: string;
  content: string;
  status: "pending" | "done";
};

async function loadNextSteps(): Promise<NextStepDbRow[]> {
  const ctx = await supabaseForUser();
  if (!ctx) return [];
  const { data, error } = await ctx.client
    .from("next_steps")
    .select("id, content, status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as NextStepDbRow[] | null) ?? [];
}

// Checklist page entered from the Home card's "Continue Growth
// Progress" CTA. Splits rows into Pending + Completed so the user
// sees outstanding actions first; completed items render struck
// through and muted at the bottom so recent wins are visible
// without dominating.
//
// Not one of the five main tabs — active={null} so the BottomNav
// renders without highlighting anything.

export default async function NextStepsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ack = await getDisclaimerAcknowledgedAt();
  if (!isDisclaimerAcknowledged(ack)) redirect("/disclaimer");

  const rows = await loadNextSteps();
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status === "done");

  return (
    <PageShell active={null}>
      <h1 className="text-3xl font-bold text-white">Next Steps</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Small actions your coach has surfaced between sessions.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-neutral-400">
          No next steps yet — they&apos;ll appear after your next coaching
          session.
        </p>
      ) : (
        <>
          {pending.length > 0 ? (
            <ul className="mt-6 flex flex-col gap-3">
              {pending.map((r) => (
                <li key={r.id}>
                  <NextStepRow
                    id={r.id}
                    content={r.content}
                    status={r.status}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {done.length > 0 ? (
            <>
              <h2 className="mt-8 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Completed
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {done.map((r) => (
                  <li key={r.id}>
                    <NextStepRow
                      id={r.id}
                      content={r.content}
                      status={r.status}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

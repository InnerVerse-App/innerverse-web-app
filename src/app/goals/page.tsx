import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type NextStepRow = {
  id: string;
  content: string;
  created_at: string;
};

async function loadRecentNextSteps(limit = 10): Promise<NextStepRow[]> {
  const ctx = await supabaseForUser();
  if (!ctx) return [];
  const { data, error } = await ctx.client
    .from("next_steps")
    .select("id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as NextStepRow[] | null) ?? [];
}

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const goals = onboarding?.top_goals ?? [];
  const extraGoal = onboarding?.top_goals_input?.trim() ?? "";
  const nextSteps = await loadRecentNextSteps();

  return (
    <PageShell active="goals">
      <h1 className="text-3xl font-bold text-white">Goals</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Your growth focus. Editable in a later version.
      </p>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-base font-semibold text-white">Top Goals</h2>
        {goals.length === 0 && !extraGoal ? (
          <p className="mt-3 text-sm text-neutral-500">
            No goals selected during onboarding.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {goals.map((goal) => (
              <li
                key={goal}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-neutral-200"
              >
                {goal}
              </li>
            ))}
            {extraGoal ? (
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-neutral-200">
                {extraGoal}
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-base font-semibold text-white">
          Suggested Next Steps
        </h2>
        {nextSteps.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Your coach will surface next steps as you complete sessions.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {nextSteps.map((step) => (
              <li
                key={step.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-neutral-200"
              >
                {step.content}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

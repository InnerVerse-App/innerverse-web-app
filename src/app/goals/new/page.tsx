import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import { loadGoalCatalogState } from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { NewGoalForm } from "./NewGoalForm";
import { PredefinedGoalsList } from "./PredefinedGoalsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a goal" };

export default async function NewGoalPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const categories = await loadGoalCatalogState(ctx);

  return (
    <PageShell active={null}>
      <h1 className="text-3xl font-bold text-white">Add a goal</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Pick from suggested goals or create your own. You can archive any
        goal later.
      </p>

      <PredefinedGoalsList categories={categories} />

      <div className="mt-10 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" aria-hidden />
        <span className="text-xs uppercase tracking-wider text-neutral-500">
          Or create your own
        </span>
        <span className="h-px flex-1 bg-white/10" aria-hidden />
      </div>

      <NewGoalForm />
    </PageShell>
  );
}

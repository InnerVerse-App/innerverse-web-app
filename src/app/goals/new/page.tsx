import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";

import { NewGoalForm } from "./NewGoalForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a goal" };

export default async function NewGoalPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  return (
    <PageShell active={null}>
      <h1 className="text-3xl font-bold text-white">Add a goal</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Set the focus you want your coach to track. You can edit or
        archive it later.
      </p>
      <NewGoalForm />
    </PageShell>
  );
}

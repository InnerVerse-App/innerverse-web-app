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

// /goals/new — minimal Add-goal flow. Server-renders the shell; the
// form is a client component with useFormState for inline error
// display. Server action createGoal handles the INSERT + starter
// next_step + redirect on success.
//
// active={null} on the PageShell so no tab highlights — this is a
// sub-page reached from /goals's "+ Add" button, same pattern as
// /next-steps.

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

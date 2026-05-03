import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getOnboardingState,
  isOnboardingComplete,
  type OnboardingState,
} from "@/lib/onboarding";
import { Step1Themes } from "./Step1Themes";
import { Step2Goals } from "./Step2Goals";
import { Step3Ratings } from "./Step3Ratings";
import { Step4Notes } from "./Step4Notes";
import { Step5Coach } from "./Step5Coach";
import { Step6Disclaimer } from "./Step6Disclaimer";

export const dynamic = "force-dynamic";

type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

// Step 4 is optional. We distinguish "not yet visited" (coach_notes IS
// NULL) from "visited and possibly empty" (coach_notes IS NOT NULL,
// even ""). The Step 4 server action always writes a string.
//
// Step 6 (disclaimer) is the gate that stamps completed_at — if a user
// has picked a coach but not yet acknowledged the disclaimer, they
// land on Step 6.
function nextStep(state: OnboardingState | null): StepNumber {
  if (!state || state.why_are_you_here.length === 0) return 1;
  if (state.top_goals.length === 0) return 2;
  if (state.satisfaction_ratings == null) return 3;
  if (state.coach_notes == null) return 4;
  if (!state.coach_name) return 5;
  return 6;
}

// `?step=N` lets the in-app Back button navigate to a previous step
// without losing the user's saved values. Clamped to 1..nextStep so
// URL-hacking can't skip ahead.
function resolveStep(
  requested: string | undefined,
  next: StepNumber,
): StepNumber {
  const n = parseInt(requested ?? "", 10);
  if (Number.isFinite(n) && n >= 1 && n <= next) return n as StepNumber;
  return next;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (isOnboardingComplete(state)) {
    redirect("/home");
  }

  const step = resolveStep((await searchParams).step, nextStep(state));

  switch (step) {
    case 1:
      return (
        <Step1Themes initialSelected={state?.why_are_you_here ?? []} />
      );
    case 2:
      return (
        <Step2Goals
          initialSelected={state?.top_goals ?? []}
          initialFreeText={state?.top_goals_input ?? ""}
        />
      );
    case 3:
      return <Step3Ratings initialRatings={state?.satisfaction_ratings ?? null} />;
    case 4:
      return <Step4Notes initialNotes={state?.coach_notes ?? ""} />;
    case 5:
      return <Step5Coach initialCoach={state?.coach_name ?? null} />;
    case 6:
      return <Step6Disclaimer />;
  }
}

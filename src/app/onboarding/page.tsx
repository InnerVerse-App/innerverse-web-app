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
import { Step5Style } from "./Step5Style";
import { Step6Coach } from "./Step6Coach";

export const dynamic = "force-dynamic";

// Step 4 is optional. We distinguish "not yet visited" (coach_notes IS
// NULL) from "visited and possibly empty" (coach_notes IS NOT NULL,
// even ""). Server actions for step 4 always write a string, so once
// the user clicks Continue past step 4 the field is non-null.
function nextStep(state: OnboardingState | null): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!state || state.why_are_you_here.length === 0) return 1;
  if (state.top_goals.length === 0) return 2;
  if (state.satisfaction_ratings == null) return 3;
  if (state.coach_notes == null) return 4;
  if (state.coaching_style == null) return 5;
  return 6;
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (isOnboardingComplete(state)) {
    redirect("/");
  }

  const step = nextStep(state);

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
      return <Step5Style initialStyle={state?.coaching_style ?? null} />;
    case 6:
      return <Step6Coach initialCoach={state?.coach_name ?? null} />;
  }
}

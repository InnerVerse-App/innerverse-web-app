import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (isOnboardingComplete(state)) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to InnerVerse
      </h1>
      <p className="text-base text-foreground/70">
        Onboarding is on its way.
      </p>
    </main>
  );
}

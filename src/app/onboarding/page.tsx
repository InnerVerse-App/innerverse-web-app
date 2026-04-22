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

  // Step UIs land in chunk 4.3b. For now the placeholder confirms the
  // wiring (server can read the row, redirect logic works) so the
  // operator can ship 4.3a in isolation.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to InnerVerse
      </h1>
      <p className="text-base text-foreground/70">
        Onboarding step UIs land in chunk 4.3b. The data layer is wired up
        and ready.
      </p>
      <pre className="max-w-2xl overflow-auto rounded-md border border-foreground/10 bg-foreground/5 p-4 text-xs">
        {JSON.stringify(state ?? { user_id: session.userId, status: "fresh" }, null, 2)}
      </pre>
    </main>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.userId) {
    const state = await getOnboardingState();
    if (!isOnboardingComplete(state)) {
      redirect("/onboarding");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">
        Hello InnerVerse
      </h1>
      <div className="flex gap-3">
        <SignInButton>
          <button className="rounded-md border border-brand-primary px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/10">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-contrast hover:bg-brand-primary/90">
            Sign up
          </button>
        </SignUpButton>
      </div>
    </main>
  );
}

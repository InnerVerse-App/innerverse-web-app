import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { COACHES } from "@/app/onboarding/data";
import { BottomNav } from "./BottomNav";

export const dynamic = "force-dynamic";

function coachLabel(coachValue: string | null | undefined): string {
  if (!coachValue) return "your coach";
  return COACHES.find((c) => c.value === coachValue)?.label ?? "your coach";
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (!isOnboardingComplete(state)) {
    redirect("/onboarding");
  }

  const coach = coachLabel(state?.coach_name);

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Welcome to InnerVerse
          </h1>
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            Ready to start your growth journey?
          </p>

          <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-7 w-7 text-brand-primary"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
              </svg>
              <h2 className="text-lg font-semibold text-white sm:text-xl">
                Start Your First Session
              </h2>
            </div>
            <p className="mt-3 text-sm text-neutral-300">
              Begin your personalized coaching journey with{" "}
              <span className="font-medium text-white">{coach}</span>.
            </p>
            <p className="mt-3 text-sm text-neutral-300">
              Your coach is ready to help you explore your thoughts, set
              meaningful goals, and create lasting change.
            </p>
            <Link
              href="/sessions/new"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90"
            >
              <span aria-hidden>⚡</span>
              Start Your First Session
            </Link>
          </section>
        </div>
      </main>
      <BottomNav active="home" />
    </div>
  );
}

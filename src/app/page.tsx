import Image from "next/image";
import Link from "next/link";
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
  let showContinue = false;

  if (session?.userId) {
    const state = await getOnboardingState();
    if (!isOnboardingComplete(state)) {
      redirect("/onboarding");
    }
    showContinue = true;
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <Image
        src="/landing-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
        <Image
          src="/innerverse-mark.png"
          alt=""
          width={300}
          height={300}
          priority
          className="h-40 w-40 sm:h-48 sm:w-48"
        />
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] sm:text-5xl">
          InnerVerse
        </h1>
        <p className="max-w-xs text-sm text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] sm:text-base">
          Your personal Life Coach, always within reach.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {showContinue ? (
            <Link
              href="/home"
              className="w-64 rounded-full bg-brand-primary px-6 py-3 text-center text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90"
            >
              Continue →
            </Link>
          ) : (
            <>
              <SignUpButton>
                <button className="w-64 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90">
                  Get started
                </button>
              </SignUpButton>
              <SignInButton>
                <button className="text-sm font-medium text-white/90 underline-offset-4 transition hover:text-white hover:underline">
                  Already have an account? Sign in
                </button>
              </SignInButton>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

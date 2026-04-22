import Image from "next/image";
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <Image
        src="/landing-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-brand-dark/40" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-6 py-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/innerverse-logo.png"
            alt="InnerVerse"
            width={160}
            height={160}
            priority
            className="h-32 w-32 sm:h-40 sm:w-40"
          />
          <h1 className="text-5xl font-bold tracking-tight text-white drop-shadow-lg">
            InnerVerse
          </h1>
          <p className="text-base text-neutral-200 drop-shadow">
            Your personal Life Coach, always within reach.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <SignUpButton>
            <button className="rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90">
              Get started
            </button>
          </SignUpButton>
          <SignInButton>
            <button className="rounded-md border border-white/30 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/10">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    </main>
  );
}

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

      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <Image
          src="/innerverse-logo.jpg"
          alt=""
          width={240}
          height={240}
          priority
          className="h-48 w-48 sm:h-56 sm:w-56"
        />
        <h1 className="text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-6xl">
          InnerVerse
        </h1>
        <p className="max-w-xs text-base text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] sm:text-lg">
          Your personal Life Coach, always within reach.
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-10 z-10 flex flex-col items-center gap-3 px-6">
        <SignUpButton>
          <button className="w-full max-w-xs rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast shadow-lg transition hover:bg-brand-primary/90">
            Get started
          </button>
        </SignUpButton>
        <SignInButton>
          <button className="text-sm font-medium text-white/90 underline-offset-4 transition hover:text-white hover:underline">
            Already have an account? Sign in
          </button>
        </SignInButton>
      </div>
    </main>
  );
}

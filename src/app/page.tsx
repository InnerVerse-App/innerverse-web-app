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
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden">
      <Image
        src="/landing-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
        {/*
         * Full composition is baked into the PNG (mark + "InnerVerse"
         * wordmark + tagline), so no sibling <h1> / <p> needed — the
         * image carries the hierarchy. PNG is RGBA so the nebula
         * background shows through cleanly. Aspect is 2:3 (4440x6660);
         * width props set the intrinsic; className scales for mobile
         * vs sm+.
         */}
        <Image
          src="/innerverse-logo-color.png"
          alt="InnerVerse — Your personal Life Coach, always within reach."
          width={444}
          height={666}
          priority
          className="h-auto w-80 sm:w-96"
        />

        <div className="mt-2 flex flex-col items-center gap-3">
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

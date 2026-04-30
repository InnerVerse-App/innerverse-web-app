import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getDisclaimerAcknowledgedAt,
  isDisclaimerAcknowledged,
} from "@/lib/disclaimer";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";

import { Acknowledge } from "./Acknowledge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Important" };

export default async function DisclaimerPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ack = await getDisclaimerAcknowledgedAt();
  if (isDisclaimerAcknowledged(ack)) redirect("/home");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <header className="border-b border-white/5 px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-2xl text-base font-semibold tracking-tight text-white">
          InnerVerse
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 sm:p-8">
            <h1 className="text-center text-2xl font-bold text-white sm:text-3xl">
              One quick thing
            </h1>
            <div className="mt-6 space-y-4 text-sm text-neutral-300 sm:text-base">
              <p>
                InnerVerse is an AI thinking partner — not therapy and not a
                replacement for professional mental health care. The coach can
                make mistakes, so use your own judgment.
              </p>
              <p>
                If you&apos;re in crisis, please reach out to a real human:{" "}
                <span className="text-white">US: call or text 988</span>
                {" · "}
                <span className="text-white">UK: 116 123</span>
                {" · "}
                <span className="text-white">EU: 112</span>.
              </p>
              <p className="text-neutral-400">
                The full disclaimer is in Settings.
              </p>
            </div>
            <div className="mt-8">
              <Acknowledge />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

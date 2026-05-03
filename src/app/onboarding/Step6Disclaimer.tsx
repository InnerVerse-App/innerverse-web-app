"use client";

import Link from "next/link";

import { OnboardingShell } from "./OnboardingShell";
import { saveStep6 } from "./actions";

export function Step6Disclaimer() {
  return (
    <OnboardingShell
      step={6}
      title="One quick thing"
      continueLabel="I understand"
      canContinue={true}
      onContinue={() => saveStep6()}
    >
      <div className="space-y-4 text-sm text-neutral-300 sm:text-base">
        <p>
          InnerVerse is an AI thinking partner. It is not a therapist,
          counselor, or substitute for professional mental health treatment.
          The coach can make mistakes. Take what&apos;s useful, leave the
          rest.
        </p>
        <p>
          Your data is private to your account. You can read the full{" "}
          <Link
            href="/privacy"
            className="text-brand-primary underline-offset-4 hover:underline"
          >
            privacy policy
          </Link>{" "}
          in Settings.
        </p>
        <p>
          If you&apos;re in crisis, please reach out to a real human:{" "}
          <span className="text-white">US: call or text 988</span>
          {" · "}
          <span className="text-white">UK: 116 123</span>
          {" · "}
          <span className="text-white">EU: 112</span>.
        </p>
      </div>
    </OnboardingShell>
  );
}

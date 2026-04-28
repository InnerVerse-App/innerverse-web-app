import { SignUp } from "@clerk/nextjs";

// forceRedirectUrl makes the post-sign-up destination /home directly,
// skipping the splash. /home itself bounces to /onboarding when
// onboarding isn't complete, so new users still land on the right
// next step.
export default function SignUpPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-8">
      <SignUp forceRedirectUrl="/home" signInForceRedirectUrl="/home" />
    </main>
  );
}

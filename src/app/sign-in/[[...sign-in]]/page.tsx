import { SignIn } from "@clerk/nextjs";

// forceRedirectUrl makes the post-sign-in destination /home directly,
// skipping the splash. The splash with Continue button is reserved
// for already-signed-in users who hit / on app open.
export default function SignInPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-8">
      <SignIn forceRedirectUrl="/home" signUpForceRedirectUrl="/home" />
    </main>
  );
}

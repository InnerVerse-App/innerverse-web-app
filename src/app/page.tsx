import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">
        Hello InnerVerse
      </h1>
      <Show
        when="signed-in"
        fallback={
          <div className="flex gap-3">
            <SignInButton>
              <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">
                Sign up
              </button>
            </SignUpButton>
          </div>
        }
      >
        <UserButton />
      </Show>
    </main>
  );
}

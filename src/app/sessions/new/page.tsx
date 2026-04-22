import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-dark px-6 py-8 text-center text-neutral-200">
      <h1 className="text-3xl font-bold text-white">Coaching session</h1>
      <p className="max-w-md text-sm text-neutral-400">
        The live coaching experience lands next. Your onboarding answers are
        already saved and ready to feed the first session prompt.
      </p>
      <Link
        href="/home"
        className="mt-2 rounded-md border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:bg-white/5"
      >
        ← Back home
      </Link>
    </main>
  );
}

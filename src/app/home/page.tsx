import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { COACHES } from "@/app/onboarding/data";
import { startSession } from "@/app/sessions/actions";
import { supabaseForUser } from "@/lib/supabase";
import { BottomNav } from "./BottomNav";
import { StartSessionButton } from "./StartSessionButton";

export const dynamic = "force-dynamic";

type LastSession = {
  id: string;
  ended_at: string;
  summary: string | null;
  progress_summary_short: string | null;
};

function coachLabel(coachValue: string | null | undefined): string {
  if (!coachValue) return "your coach";
  return COACHES.find((c) => c.value === coachValue)?.label ?? "your coach";
}

async function loadLastCompletedSession(): Promise<LastSession | null> {
  const ctx = await supabaseForUser();
  if (!ctx) return null;
  const { data, error } = await ctx.client
    .from("sessions")
    .select("id, ended_at, summary, progress_summary_short")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LastSession | null) ?? null;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/sign-in");
  }

  const state = await getOnboardingState();
  if (!isOnboardingComplete(state)) {
    redirect("/onboarding");
  }

  const coach = coachLabel(state?.coach_name);
  const lastSession = await loadLastCompletedSession();

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Welcome to InnerVerse
          </h1>
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            Ready to start your growth journey?
          </p>

          {lastSession ? (
            <LastSessionCard session={lastSession} />
          ) : (
            <FirstSessionCard coachLabelText={coach} />
          )}
        </div>
      </main>
      <BottomNav active="home" />
    </div>
  );
}

function FirstSessionCard({ coachLabelText }: { coachLabelText: string }) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-brand-primary"
          aria-hidden
        >
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Start Your First Session
        </h2>
      </div>
      <p className="mt-3 text-sm text-neutral-300">
        Begin your personalized coaching journey with{" "}
        <span className="font-medium text-white">{coachLabelText}</span>.
      </p>
      <p className="mt-3 text-sm text-neutral-300">
        Your coach is ready to help you explore your thoughts, set meaningful
        goals, and create lasting change.
      </p>
      <form action={startSession} className="mt-5">
        <StartSessionButton label="Start Your First Session" />
      </form>
    </section>
  );
}

function LastSessionCard({ session }: { session: LastSession }) {
  const summaryText =
    session.summary ??
    session.progress_summary_short ??
    "Your previous session is still being analyzed — check back in a few minutes.";

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-brand-primary"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.25" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Last Coaching Session
        </h2>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        {formatSessionDate(session.ended_at)}
      </p>
      <p className="mt-3 text-sm text-neutral-300">{summaryText}</p>
      <form action={startSession} className="mt-5">
        <StartSessionButton label="Start a New Session" />
      </form>
      <Link
        href={`/sessions/${session.id}`}
        className="mt-3 block text-center text-xs text-neutral-400 transition hover:text-brand-primary"
      >
        View session
      </Link>
    </section>
  );
}

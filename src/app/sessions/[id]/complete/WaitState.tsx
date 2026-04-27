"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Polled while the v6/v7 analysis runs in the background. Calls
// router.refresh() every POLL_INTERVAL_MS so the parent server
// component re-fetches the session row and switches to the
// narrative form once `coach_narrative` is populated.
const POLL_INTERVAL_MS = 3500;

// Tiered observability + UX for stuck analyses. The OpenAI client
// timeout is 180s, so anything still polling past this window has
// almost certainly errored out and is waiting on the cron retry
// to recover. We surface that as a soft fallback rather than an
// infinite spinner.
const BREADCRUMB_AFTER_MS = 90_000;
const FALLBACK_AFTER_MS = 200_000;

// Rotating reflection prompts shown during the wait. Cycles every
// PROMPT_INTERVAL_MS so the user has something to chew on while the
// AI finishes — stops the screen from feeling like a stalled spinner.
// The list is intentionally short and gentle; these are reflection
// invitations, not productivity prompts.
const WAIT_PROMPTS = [
  "Take a moment to reflect on this session…",
  "What was alive for you today?",
  "Where did your body settle, even briefly?",
  "What surprised you?",
  "What does the version of you who showed up today need?",
  "Is there anything you noticed that you don't want to forget?",
];
const PROMPT_INTERVAL_MS = 5000;

export function WaitState() {
  const router = useRouter();
  const [promptIdx, setPromptIdx] = useState(0);
  // Tracks how long we've been polling so we can flip into the
  // fallback view if the analysis appears to have stalled.
  const [showFallback, setShowFallback] = useState(false);

  // Poll the server until the parent (a server component) sees the
  // narrative ready and stops rendering this client. router.refresh()
  // re-runs the server component without a hard reload.
  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  // Rotate the reflection prompt independently of the polling cadence
  // so the UI feels alive even if router.refresh hasn't yet swapped
  // in new content.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPromptIdx((i) => (i + 1) % WAIT_PROMPTS.length);
    }, PROMPT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Stall handling.
  // - At BREADCRUMB_AFTER_MS: send a Sentry breadcrumb so we see in
  //   production how often analyses are running long. Doesn't change
  //   the UI; just observability.
  // - At FALLBACK_AFTER_MS: swap the spinner for a "session saved,
  //   analysis is taking longer than usual" message + Home CTA. The
  //   cron's retry pass picks up unanalyzed sessions overnight, so
  //   the summary will still be generated; the user just doesn't have
  //   to stare at a stuck spinner.
  useEffect(() => {
    const breadcrumb = window.setTimeout(() => {
      Sentry.captureMessage("post_session_wait_state_extended", {
        level: "warning",
        tags: { stage: "post_session_wait_extended" },
        extra: { thresholdMs: BREADCRUMB_AFTER_MS },
      });
    }, BREADCRUMB_AFTER_MS);
    const fallback = window.setTimeout(() => {
      setShowFallback(true);
    }, FALLBACK_AFTER_MS);
    return () => {
      window.clearTimeout(breadcrumb);
      window.clearTimeout(fallback);
    };
  }, []);

  if (showFallback) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <h1 className="text-lg font-semibold text-white">
              Your session is saved
            </h1>
            <p className="text-sm leading-relaxed text-neutral-300">
              The summary is taking a little longer than usual to put
              together. We&apos;ll have it ready next time you check
              the Sessions tab. No need to wait here.
            </p>
            <Link
              href="/home"
              className="mt-2 rounded-md bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-contrast transition hover:bg-brand-primary/90"
            >
              Head home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex flex-col items-center gap-6">
          <Spinner />
          <div className="flex flex-col gap-3">
            <h1 className="text-lg font-semibold text-white">
              Putting together your session summary
            </h1>
            <p className="text-sm italic text-neutral-300">
              {WAIT_PROMPTS[promptIdx]}
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 pb-8 text-center">
        <Link
          href="/home"
          className="text-xs text-neutral-500 underline-offset-4 transition hover:text-neutral-300 hover:underline"
        >
          Skip for now — I&apos;ll check back later
        </Link>
      </footer>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-brand-primary"
      aria-label="Loading"
    />
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Polled while the v6 analysis runs in the background. Calls
// router.refresh() every POLL_INTERVAL_MS so the parent server
// component re-fetches the session row and switches to the
// narrative form once `coach_narrative` is populated.
const POLL_INTERVAL_MS = 3500;

// Rotating reflection prompts shown during the wait. Cycles every
// PROMPT_INTERVAL_MS so the user has something to chew on while the
// AI finishes — stops the screen from feeling like a stalled spinner.
// Kept gentle and reflection-oriented; these are invitations, not
// productivity prompts.
const WAIT_PROMPTS = [
  "Take a moment to reflect on this session…",
  "What was alive for you today?",
  "Where did your body settle, even briefly?",
  "What surprised you?",
  "What does the version of you who showed up today need?",
  "Is there anything you noticed that you don't want to forget?",
  "What's one moment from this session you want to come back to?",
  "What were you carrying when you walked in, and is it lighter now?",
  "What did you say out loud that you've been meaning to say?",
  "What feels a little clearer than it did when we started?",
];
const PROMPT_INTERVAL_MS = 5000;

export function WaitState() {
  const router = useRouter();
  const [promptIdx, setPromptIdx] = useState(0);

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

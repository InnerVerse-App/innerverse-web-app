"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { BackArrowIcon } from "@/app/_components/icons";
import { submitSessionFeedback } from "../../actions";
import { FEEDBACK_FIELDS } from "./fields";

type Props = { sessionId: string };

export function FeedbackForm({ sessionId }: Props) {
  const submit = submitSessionFeedback.bind(null, sessionId);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <header className="border-b border-white/10 px-4 pb-4 pt-5">
        <h1 className="text-2xl font-bold text-white">Session Complete</h1>
        <div className="mt-1 flex items-center gap-2">
          <Link
            href="/home"
            aria-label="Back"
            className="rounded-md p-1 text-neutral-400 transition hover:bg-white/5 hover:text-white"
          >
            <BackArrowIcon className="h-5 w-5" />
          </Link>
          <p className="text-sm text-neutral-400">
            Help us improve your coaching experience
          </p>
        </div>
      </header>

      <form action={submit} className="flex-1 px-4 py-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <Section
            title="Session Reflection"
            subtitle="Want to capture any insights from this session? This note is just for you."
          >
            <textarea
              name={FEEDBACK_FIELDS.REFLECTION}
              rows={4}
              placeholder="What stood out to you in this session? Any insights or realizations…"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </Section>

          <Section
            title="Feedback Survey"
            subtitle="Your feedback helps us improve your coaching experience"
          >
            <RatingSlider
              name={FEEDBACK_FIELDS.ALIGNED_RATING}
              question="Did this session feel aligned with what you needed today?"
              lowLabel="Not aligned"
              highLabel="Very aligned"
            />
            <RatingSlider
              name={FEEDBACK_FIELDS.HELPFUL_RATING}
              question="How helpful were the questions and reflections?"
              lowLabel="Not helpful"
              highLabel="Very helpful"
            />
            <RatingSlider
              name={FEEDBACK_FIELDS.TONE_RATING}
              question="How would you rate your coach's tone?"
              lowLabel="Too direct"
              highLabel="Too warm"
            />
          </Section>

          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              Additional feedback{" "}
              <span className="text-xs text-neutral-500">(optional)</span>
            </label>
            <textarea
              name={FEEDBACK_FIELDS.ADDITIONAL_FEEDBACK}
              rows={3}
              placeholder="Any additional thoughts about this session? What could be improved?"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <SubmitButton />
            <Link
              href="/home"
              className="rounded-md border border-white/10 px-6 py-3 text-center text-sm font-medium text-brand-primary transition hover:bg-white/5"
            >
              Skip for now
            </Link>
          </div>

          <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-neutral-400">
            <span className="text-brand-primary">💡 Your privacy matters:</span>{" "}
            All feedback is used solely to improve your coaching experience.
            Your responses help us understand what&apos;s working well and what
            could be better.
          </p>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2">
        <SpeechBubbleIcon className="h-5 w-5 text-brand-primary" />
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{subtitle}</p>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function SpeechBubbleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.16-3.026-.456L3 21l1.586-4.243A8.06 8.06 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
    </svg>
  );
}

function RatingSlider({
  name,
  question,
  lowLabel,
  highLabel,
}: {
  name: string;
  question: string;
  lowLabel: string;
  highLabel: string;
}) {
  const [value, setValue] = useState(3);
  // 1..5 → 0..100% — drives the split-color track gradient via
  // --fill-pct. Without it Chrome would paint the full track in one
  // color (Firefox uses ::-moz-range-progress and doesn't need this).
  const fillPct = ((value - 1) / 4) * 100;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-200">{question}</p>
        <span className="text-sm font-semibold text-brand-alert">{value}</span>
      </div>
      <input
        type="range"
        name={name}
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => setValue(Number.parseInt(e.target.value, 10))}
        style={{ "--fill-pct": `${fillPct}%` } as React.CSSProperties}
        className="feedback-slider mt-3 w-full"
      />
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
        <span>1- {lowLabel}</span>
        <span>5- {highLabel}</span>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-brand-primary-contrast transition hover:bg-brand-primary/90 disabled:opacity-70"
    >
      {pending ? "Submitting…" : "Submit Feedback"}
    </button>
  );
}

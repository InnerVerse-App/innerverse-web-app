"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { submitSessionResponse } from "../../actions";
import {
  ALIGNED_RATING_FIELD,
  HELPFUL_RATING_FIELD,
  POST_SESSION_RESPONSE_FIELD,
  SESSION_REFLECTION_FIELD,
  TONE_RATING_FIELD,
} from "./fields";

// Default invitation shown under the narrative when the session-end
// prompt didn't emit a tailored `narrative_reflection_prompt`. The
// schema column exists for future LLM-tailored prompts but the v6
// rubric doesn't emit one yet — so we render a single warm default.
const DEFAULT_REFLECTION_PROMPT =
  "Does any of this resonate? Anything you'd push back on, or want to add?";

type Props = {
  sessionId: string;
  coachNarrative: string;
  reflectionPrompt: string | null;
};

export function NarrativeForm({
  sessionId,
  coachNarrative,
  reflectionPrompt,
}: Props) {
  const submit = submitSessionResponse.bind(null, sessionId);
  const prompt = reflectionPrompt?.trim() || DEFAULT_REFLECTION_PROMPT;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <header className="border-b border-white/10 px-4 pb-4 pt-5">
        <h1 className="text-2xl font-bold text-white">Session Complete</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A reflection from your coach.
        </p>
      </header>

      <form action={submit} className="flex-1 px-4 py-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            {/* white-space-pre-wrap so paragraph breaks in the LLM's
                multi-paragraph narrative survive into the rendered
                view (the v6 prompt allows 1–3 short paragraphs). */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
              {coachNarrative}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <label
              htmlFor={POST_SESSION_RESPONSE_FIELD}
              className="text-sm font-medium text-white"
            >
              {prompt}
            </label>
            <textarea
              id={POST_SESSION_RESPONSE_FIELD}
              name={POST_SESSION_RESPONSE_FIELD}
              rows={5}
              placeholder="Write what comes up — or skip if nothing does."
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-base font-semibold text-white">
              Quick feedback
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Helps your coach calibrate. Your last few sessions shape
              the tone and style of the next one.
            </p>
            <div className="mt-4 flex flex-col gap-5">
              <RatingSlider
                name={ALIGNED_RATING_FIELD}
                question="Did this session feel aligned with what you needed today?"
                lowLabel="Not aligned"
                highLabel="Very aligned"
              />
              <RatingSlider
                name={HELPFUL_RATING_FIELD}
                question="How helpful were the questions and reflections?"
                lowLabel="Not helpful"
                highLabel="Very helpful"
              />
              <RatingSlider
                name={TONE_RATING_FIELD}
                question="How would you rate your coach's tone?"
                lowLabel="Too direct"
                highLabel="Too warm"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <label
              htmlFor={SESSION_REFLECTION_FIELD}
              className="text-sm font-medium text-white"
            >
              Session note{" "}
              <span className="text-xs font-normal text-neutral-500">
                (just for you)
              </span>
            </label>
            <textarea
              id={SESSION_REFLECTION_FIELD}
              name={SESSION_REFLECTION_FIELD}
              rows={3}
              placeholder="Any insights or realizations you want to capture for yourself…"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </section>

          <div className="flex flex-col gap-2 pt-2">
            <SubmitButton />
            <Link
              href="/home"
              className="rounded-md border border-white/10 px-6 py-3 text-center text-sm font-medium text-brand-primary transition hover:bg-white/5"
            >
              That&apos;s enough for today
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}

// Tracks whether the user actually moved the slider. An untouched
// slider submits no value (the hidden input stays unrendered), which
// the action layer reads as NULL — telling the aggregator "no signal
// from this question this session" rather than a misleading neutral 3.
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
  const [touched, setTouched] = useState(false);
  const fillPct = ((value - 1) / 4) * 100;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-200">{question}</p>
        <span className="text-sm font-semibold text-brand-alert">
          {touched ? value : "—"}
        </span>
      </div>
      <input
        type="range"
        // No `name` until touched: an unrendered name means the
        // FormData entry is absent and we persist NULL. Browsers
        // submit a default value for any named range input, so
        // the only reliable way to capture "no answer" is to keep
        // the input unnamed until interaction.
        name={touched ? name : undefined}
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => {
          setValue(Number.parseInt(e.target.value, 10));
          setTouched(true);
        }}
        style={{ "--fill-pct": `${fillPct}%` } as React.CSSProperties}
        className="feedback-slider mt-3 w-full"
      />
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
        <span>1 — {lowLabel}</span>
        <span>5 — {highLabel}</span>
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
      {pending ? "Saving…" : "Save reflection"}
    </button>
  );
}

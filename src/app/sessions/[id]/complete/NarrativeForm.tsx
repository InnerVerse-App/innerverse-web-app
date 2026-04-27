"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { submitSessionResponse } from "../../actions";
import { POST_SESSION_RESPONSE_FIELD } from "./fields";

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
              maxLength={5000}
              placeholder="Write what comes up — or skip if nothing does."
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

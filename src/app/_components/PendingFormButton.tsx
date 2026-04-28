"use client";

import { useFormStatus } from "react-dom";

import { PendingDots } from "./PendingDots";

// Submit button that flips to a loading state via React's
// useFormStatus while the parent <form action={...}> is pending.
// Use this for any server-action form that takes more than a fraction
// of a second to return — without it, users tap and then nothing
// changes until the redirect fires (often 2-5s for OpenAI calls).
//
// MUST be rendered inside a <form>; useFormStatus only reads the
// nearest ancestor form's pending state.

type Props = {
  className?: string;
  // Same className applied while pending. If you want a distinct
  // pending look (e.g. dim the bg), provide it here.
  pendingClassName?: string;
  // Optional small label rendered next to the dots. Defaults to no
  // text — just the dots animation.
  pendingLabel?: string;
  // Children render in the default (non-pending) state. Typically
  // a span + label.
  children: React.ReactNode;
  // Tailwind color class for the dots while pending. Defaults to
  // matching the surrounding text color.
  dotsColorClass?: string;
};

export function PendingFormButton({
  className,
  pendingClassName,
  pendingLabel,
  children,
  dotsColorClass = "bg-current",
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        (pending && pendingClassName ? pendingClassName : className ?? "") +
        " transition active:scale-[0.98] disabled:cursor-progress"
      }
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <PendingDots
            sizeClass="h-1.5 w-1.5"
            colorClass={dotsColorClass}
            ariaLabel={pendingLabel ?? "Loading"}
          />
          {pendingLabel ? <span>{pendingLabel}</span> : null}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

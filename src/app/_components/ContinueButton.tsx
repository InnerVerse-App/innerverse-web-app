"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PendingDots } from "./PendingDots";

// Splash-page Continue button. Replaces a plain Next.js <Link> so we
// can show pending state while /home loads — /home does several
// Supabase reads server-side, so the navigation is not instant. Adds
// active:scale-[0.98] for the tap-press feel.

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export function ContinueButton({ href, children, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      className={
        (className ?? "") +
        " transition active:scale-[0.98] disabled:cursor-progress"
      }
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <PendingDots
            sizeClass="h-1.5 w-1.5"
            colorClass="bg-current"
            ariaLabel="Loading"
          />
          <span>Loading</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

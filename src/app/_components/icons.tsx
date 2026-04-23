import type { SVGProps } from "react";

// Shared icon components. One-shot icons (used in a single spot) stay
// inline at their call site; anything used in 3+ places lives here.
export function BackArrowIcon(
  props: SVGProps<SVGSVGElement> = {},
) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

// Three pulsing dots — used in pending button states and as the
// coach-typing indicator in chat (see ChatView's TypingDots which
// is the same shape; we keep this component generic so other
// surfaces can reuse it).
//
// Animation: Tailwind's animate-pulse on each dot, with staggered
// inline animation-delay (Tailwind doesn't accept per-instance
// delay variants).

type Props = {
  // Tailwind color class for the dots, e.g. "bg-white" or
  // "bg-neutral-400". Defaults to neutral-400 to match the chat
  // typing dots.
  colorClass?: string;
  // Tailwind size class — "h-1.5 w-1.5" for tight inline spaces,
  // "h-2 w-2" for standalone use. Defaults to "h-2 w-2".
  sizeClass?: string;
  ariaLabel?: string;
};

export function PendingDots({
  colorClass = "bg-neutral-400",
  sizeClass = "h-2 w-2",
  ariaLabel = "Loading",
}: Props) {
  const base = `block ${sizeClass} animate-pulse rounded-full ${colorClass}`;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="status"
      aria-label={ariaLabel}
    >
      <span className={base} />
      <span className={base} style={{ animationDelay: "0.2s" }} />
      <span className={base} style={{ animationDelay: "0.4s" }} />
    </span>
  );
}

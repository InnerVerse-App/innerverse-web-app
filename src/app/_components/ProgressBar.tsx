type Props = {
  // 0–100. Width of the filled portion is percent% of the track.
  percent: number;
  // "default" renders the original brand-primary teal solid fill
  // (used by the start-session menu's compact goal previews).
  // "goal" is a deprecated alias for { color: "#4ADE80" } and is
  // retained so callers that haven't migrated yet keep their look.
  // When `color` is provided, it overrides any variant: the bar
  // uses a dim-to-bright gradient in that hex color and applies
  // a global opacity from `opacity` so a low-percent stale dot
  // also looks dim, not just narrow.
  variant?: "default" | "goal";
  color?: string;
  // 0–1. Multiplied into the fill's opacity so the bar fades in
  // brightness as well as width when something is decaying. Default
  // 1 (no fade) so existing call sites are unchanged.
  opacity?: number;
};

const GOAL_FILL_GRADIENT =
  "linear-gradient(to right, rgba(74,222,128,0.18) 0%, rgba(74,222,128,1) 100%)";

// Build a dim-to-bright gradient string for any hex color. The
// alpha-suffix trick (#RRGGBB + 2-hex alpha) is the same shape the
// recency bar uses elsewhere in the app.
function gradientFor(hex: string): string {
  return `linear-gradient(to right, ${hex}2D 0%, ${hex} 100%)`;
}

export function ProgressBar({
  percent,
  variant = "default",
  color,
  opacity = 1,
}: Props) {
  const useGradient = !!color || variant === "goal";
  const background = color
    ? gradientFor(color)
    : variant === "goal"
      ? GOAL_FILL_GRADIENT
      : undefined;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={useGradient ? "h-full" : "h-full bg-brand-primary"}
        style={
          useGradient
            ? { width: `${percent}%`, background, opacity }
            : { width: `${percent}%`, opacity }
        }
        aria-hidden
      />
    </div>
  );
}

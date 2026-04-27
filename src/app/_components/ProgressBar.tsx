type Props = {
  percent: number;
  // "goal" renders the bar in green and fades the filled portion
  // from dim on the left to bright on the right — matches the
  // goal-color (#4ADE80) used elsewhere for goal stars / comets.
  variant?: "default" | "goal";
};

const GOAL_FILL_GRADIENT =
  "linear-gradient(to right, rgba(74,222,128,0.18) 0%, rgba(74,222,128,1) 100%)";

export function ProgressBar({ percent, variant = "default" }: Props) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={variant === "default" ? "h-full bg-brand-primary" : "h-full"}
        style={
          variant === "goal"
            ? { width: `${percent}%`, background: GOAL_FILL_GRADIENT }
            : { width: `${percent}%` }
        }
        aria-hidden
      />
    </div>
  );
}

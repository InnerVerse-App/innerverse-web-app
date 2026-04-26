// Small circular progress ring with the percentage in the middle.
// Used on goal cards alongside the linear ProgressBar — the ring
// gives an at-a-glance sense of proximity to "done", the bar shows
// the same number as a horizontal travel meter.
//
// Only meaningful for milestone goals (those with a definitive
// finish line); practice / always-on goals shouldn't render this.

const GOAL_COLOR = "#4ADE80";

type Props = {
  percent: number;
  size?: number;
  strokeWidth?: number;
};

export function CircularProgressRing({
  percent,
  size = 56,
  strokeWidth = 4,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`${GOAL_COLOR}22`}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={GOAL_COLOR}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-white">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

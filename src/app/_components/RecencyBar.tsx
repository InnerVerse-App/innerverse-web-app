// Comet-trail recency gauge — a thin horizontal bar that visualizes
// how recently something was engaged. Width grows from the left
// edge proportional to freshness; the fill itself is a left→right
// gradient (transparent on left, bright on right), so a freshly
// engaged item shows a long bar bright on the right; a stale item
// shows a short, dim sliver. Items older than the recency window
// (or never engaged) render an empty track.
//
// Color is required and should match the constellation category of
// the items being shown (gold for breakthroughs, violet for mindset
// shifts, green for goals, teal for sessions). Pass a hex string;
// the gradient is built by appending alpha suffixes.

type Props = {
  // ISO timestamp of last engagement / creation. null → "never" /
  // pre-history; renders an empty track.
  lastEngagedAt: string | null;
  // Hex color matching the constellation category, e.g. "#DCA114".
  color: string;
  // The window over which the gauge fades to empty. Default 30 days
  // matches the constellation's recency curve.
  windowDays?: number;
};

export function RecencyBar({
  lastEngagedAt,
  color,
  windowDays = 30,
}: Props) {
  let widthFrac = 0;
  let opacity = 1;
  if (lastEngagedAt) {
    const days = Math.max(
      0,
      (Date.now() - Date.parse(lastEngagedAt)) / 86_400_000,
    );
    // freshness: 1 today → 0 at windowDays ago.
    widthFrac = Math.max(0, 1 - days / windowDays);
    // Opacity also decays so the gradient on the bar is visible
    // (otherwise the rightmost color would always be at full
    // brightness even for stale items).
    opacity = Math.max(0.15, 1 - (days / windowDays) * 0.85);
  }

  return (
    <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
      {widthFrac > 0 ? (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${widthFrac * 100}%`,
            background: `linear-gradient(to right, ${color}00, ${color}99, ${color})`,
            opacity,
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

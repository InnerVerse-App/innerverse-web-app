type Props = {
  percent: number;
};

export function ProgressBar({ percent }: Props) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full bg-brand-primary"
        style={{ width: `${percent}%` }}
        aria-hidden
      />
    </div>
  );
}

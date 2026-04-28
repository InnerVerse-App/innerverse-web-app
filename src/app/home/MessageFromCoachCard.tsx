import Link from "next/link";

type Props = {
  message: string;
};

export function MessageFromCoachCard({ message }: Props) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-brand-primary"
          aria-hidden
        >
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          <path d="M19 14l0.6 1.8L21.5 16.5l-1.8 0.6L19 19l-0.6-1.8L16.5 16.5l1.8-0.6L19 14z" />
        </svg>
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Message from your Coach
        </h2>
      </div>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-neutral-300">
        {message
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
      <Link
        href="/next-steps"
        className="mt-5 block rounded-md border border-brand-primary/40 px-4 py-3 text-center text-sm font-medium text-brand-primary transition hover:bg-brand-primary/10"
      >
        Continue Growth Progress
      </Link>
    </section>
  );
}

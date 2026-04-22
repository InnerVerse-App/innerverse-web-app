import type { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
};

export function TipCallout({ label, children }: Props) {
  return (
    <p className="rounded-md bg-white/5 p-3 text-xs text-neutral-300">
      💡 <span className="font-medium">{label}:</span> {children}
    </p>
  );
}

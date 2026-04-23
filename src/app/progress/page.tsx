import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { BottomNav } from "@/app/home/BottomNav";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type TextRow = {
  id: string;
  content: string;
  created_at: string;
};

async function loadProgress(): Promise<{
  breakthroughs: TextRow[];
  insights: TextRow[];
}> {
  const ctx = await supabaseForUser();
  if (!ctx) return { breakthroughs: [], insights: [] };
  const [brRes, inRes] = await Promise.all([
    ctx.client
      .from("breakthroughs")
      .select("id, content, created_at")
      .order("created_at", { ascending: false }),
    ctx.client
      .from("insights")
      .select("id, content, created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (brRes.error) throw brRes.error;
  if (inRes.error) throw inRes.error;
  return {
    breakthroughs: (brRes.data as TextRow[] | null) ?? [],
    insights: (inRes.data as TextRow[] | null) ?? [],
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function ProgressPage() {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const { breakthroughs, insights } = await loadProgress();

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark text-neutral-200">
      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-white">Your Progress</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Track your personal growth development.
          </p>

          <Section title="Breakthroughs" items={breakthroughs} />
          <Section title="Insights" items={insights} />
        </div>
      </main>
      <BottomNav active="progress" />
    </div>
  );
}

function Section({ title, items }: { title: string; items: TextRow[] }) {
  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing here yet — {title.toLowerCase()} are created from your
          coaching sessions.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <p className="text-sm text-neutral-200">{item.content}</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {formatDate(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

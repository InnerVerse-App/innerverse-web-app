import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { PageShell } from "@/app/_components/PageShell";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { EditGoalForm } from "./EditGoalForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit goal" };

export default async function EditGoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const { id } = await params;

  const { data, error } = await ctx.client
    .from("goals")
    .select("id, title, description, is_predefined")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect("/goals");
  if (data.is_predefined) redirect("/goals");

  return (
    <PageShell active={null}>
      <h1 className="text-3xl font-bold text-white">Edit goal</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Update the title or description. You can archive this goal from
        the Goals tab.
      </p>
      <EditGoalForm
        id={data.id}
        initialTitle={data.title}
        initialDescription={data.description ?? ""}
      />
    </PageShell>
  );
}

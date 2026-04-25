"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export async function archiveGoal(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw : "";
  if (!id) redirect("/goals");

  const { error } = await ctx.client
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw error;

  revalidatePath("/goals");
  revalidatePath("/goals/new");
  revalidatePath("/home");
}

"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export async function acknowledgeDisclaimer(): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const { error } = await ctx.client
    .from("users")
    .update({ disclaimer_acknowledged_at: new Date().toISOString() })
    .eq("id", ctx.userId);
  if (error) {
    console.error("acknowledgeDisclaimer: update failed", {
      userId: ctx.userId,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  redirect("/home");
}

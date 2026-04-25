"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

import {
  DESCRIPTION_MAX,
  TITLE_MAX,
} from "@/app/goals/new/limits";
import { PG_UNIQUE_VIOLATION } from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

export type UpdateGoalState = {
  error: string | null;
};

export async function updateGoal(
  _prev: UpdateGoalState,
  formData: FormData,
): Promise<UpdateGoalState> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" ? idRaw : "";
  if (!id) redirect("/goals");

  const titleRaw = formData.get("title");
  const descriptionRaw = formData.get("description");
  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const description =
    typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";

  if (title.length === 0) return { error: "Give your goal a title." };
  if (title.length > TITLE_MAX) {
    return { error: `Title is too long (max ${TITLE_MAX} characters).` };
  }
  if (description.length > DESCRIPTION_MAX) {
    return {
      error: `Description is too long (max ${DESCRIPTION_MAX} characters).`,
    };
  }

  // Renaming a predefined goal would orphan its catalog match
  // (joined by title). UI hides the edit link for these, but the
  // action is independently callable, so re-check here.
  const goalRes = await ctx.client
    .from("goals")
    .select("is_predefined")
    .eq("id", id)
    .maybeSingle();
  if (goalRes.error) throw goalRes.error;
  if (!goalRes.data) redirect("/goals");
  if (goalRes.data.is_predefined) redirect("/goals");

  const updateRes = await ctx.client
    .from("goals")
    .update({ title, description: description || null })
    .eq("id", id);
  if (updateRes.error) {
    if (updateRes.error.code === PG_UNIQUE_VIOLATION) {
      return {
        error: "You already have an active goal with that title.",
      };
    }
    throw updateRes.error;
  }

  revalidatePath("/goals");
  revalidatePath("/goals/new");
  revalidatePath("/home");
  redirect("/goals");
}

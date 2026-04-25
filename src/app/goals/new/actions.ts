"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { CUSTOM_GOAL_GENERIC_STARTER } from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import { DESCRIPTION_MAX, TITLE_MAX } from "./limits";

export type CreateGoalState = {
  error: string | null;
};

// Inserts a goal + a starter next_step. The starter has session_id=NULL
// (system-generated, not session-scoped — RLS on next_steps permits
// this for the row owner). Duplicate active titles surface as 23505
// from the (user_id, title) WHERE archived_at IS NULL partial index;
// caught and rendered inline so the user can pick a different title.
export async function createGoal(
  _prev: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  // Server actions are independently callable (direct POST / replay),
  // so re-enforce the onboarding gate that page.tsx already runs.
  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const titleRaw = formData.get("title");
  const descriptionRaw = formData.get("description");

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const description =
    typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";

  if (title.length === 0) {
    return { error: "Give your goal a title." };
  }
  if (title.length > TITLE_MAX) {
    return { error: `Title is too long (max ${TITLE_MAX} characters).` };
  }
  if (description.length > DESCRIPTION_MAX) {
    return {
      error: `Description is too long (max ${DESCRIPTION_MAX} characters).`,
    };
  }

  const insertGoalRes = await ctx.client
    .from("goals")
    .insert({
      user_id: ctx.userId,
      title,
      description: description || null,
      is_predefined: false,
    })
    .select("id")
    .single();

  if (insertGoalRes.error) {
    if (insertGoalRes.error.code === "23505") {
      return {
        error: "You already have an active goal with that title.",
      };
    }
    throw insertGoalRes.error;
  }

  // Starter failure is non-fatal — the goal lands and the LLM will
  // write a real next_step on the next session-end.
  const starterRes = await ctx.client.from("next_steps").insert({
    user_id: ctx.userId,
    goal_id: insertGoalRes.data.id,
    content: CUSTOM_GOAL_GENERIC_STARTER,
    status: "pending",
    session_id: null,
  });
  if (starterRes.error) {
    console.error("createGoal: starter next_step insert failed", {
      goalId: insertGoalRes.data.id,
      code: starterRes.error.code,
      message: starterRes.error.message,
    });
  }

  redirect("/goals");
}

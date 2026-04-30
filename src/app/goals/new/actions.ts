"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  getDisclaimerAcknowledgedAt,
  isDisclaimerAcknowledged,
} from "@/lib/disclaimer";
import {
  CUSTOM_GOAL_GENERIC_STARTER,
  PG_UNIQUE_VIOLATION,
  starterActionForGoalTitle,
} from "@/lib/goals";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { GOAL_LABEL_BY_VALUE } from "@/lib/onboarding-labels";
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

  const ack = await getDisclaimerAcknowledgedAt();
  if (!isDisclaimerAcknowledged(ack)) redirect("/disclaimer");

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
      // Default to practice; we don't have UI for picking milestone
      // vs practice yet. Most coaching goals are open-ended.
      completion_type: "practice",
    })
    .select("id")
    .single();

  if (insertGoalRes.error) {
    if (insertGoalRes.error.code === PG_UNIQUE_VIOLATION) {
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

// If an archived row with the same title exists, restores it
// (UPDATE archived_at = NULL) so progress and last_session_id
// continuity carry over. Otherwise inserts fresh.
export async function addPredefinedGoal(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const onboarding = await getOnboardingState();
  if (!isOnboardingComplete(onboarding)) redirect("/onboarding");

  const ack = await getDisclaimerAcknowledgedAt();
  if (!isDisclaimerAcknowledged(ack)) redirect("/disclaimer");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const valueRaw = formData.get("value");
  const value = typeof valueRaw === "string" ? valueRaw : "";
  const title = GOAL_LABEL_BY_VALUE.get(value);
  if (!title) redirect("/goals/new");

  const archivedRes = await ctx.client
    .from("goals")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("title", title)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (archivedRes.error) throw archivedRes.error;

  if (archivedRes.data) {
    const updateRes = await ctx.client
      .from("goals")
      .update({ archived_at: null })
      .eq("id", archivedRes.data.id);
    if (updateRes.error) throw updateRes.error;
    redirect("/goals");
  }

  const insertRes = await ctx.client
    .from("goals")
    .insert({
      user_id: ctx.userId,
      title,
      is_predefined: true,
      completion_type: "practice",
    })
    .select("id")
    .single();
  if (insertRes.error) {
    // Concurrent tab beat us — the goal is now active either way.
    if (insertRes.error.code === PG_UNIQUE_VIOLATION) redirect("/goals");
    throw insertRes.error;
  }

  const starter = starterActionForGoalTitle(title);
  if (starter) {
    const starterRes = await ctx.client.from("next_steps").insert({
      user_id: ctx.userId,
      goal_id: insertRes.data.id,
      content: starter,
      status: "pending",
      session_id: null,
    });
    if (starterRes.error) {
      console.error("addPredefinedGoal: starter next_step insert failed", {
        goalId: insertRes.data.id,
        code: starterRes.error.code,
        message: starterRes.error.message,
      });
    }
  }

  redirect("/goals");
}

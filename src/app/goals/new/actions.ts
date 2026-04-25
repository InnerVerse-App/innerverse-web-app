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

// createGoal server action — invoked from the /goals/new form.
//
// Inserts a goal with is_predefined=false, status='not_started', plus
// a starter next_steps row scoped to this goal (goal_id=new goal,
// session_id=NULL — system-generated starter, permitted by the
// next_steps_insert_own RLS as of PR #71). The starter content uses
// CUSTOM_GOAL_GENERIC_STARTER from src/lib/goals.ts; predefined goal
// starters use their per-goal text from GOAL_CATEGORIES, which the
// lazy seed handles separately.
//
// Race tolerance: the unique partial index on
// (user_id, title) WHERE archived_at IS NULL prevents two active
// goals from sharing a title. A duplicate-title submission produces
// SQLSTATE 23505 — surfaced to the user as an inline error so they
// can pick a different title.
export async function createGoal(
  _prev: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  // Onboarding gate — page.tsx already redirects unfinished users to
  // /onboarding, but server actions are independently callable (direct
  // POST / replay), so re-enforce here. Flagged by the 2026-04-25 audit
  // as correctness HIGH + architecture HIGH.
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
      description: description.length > 0 ? description : null,
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

  // Insert the starter next_step. Failure here would leave the goal
  // without an action item; we still return success and let the user
  // see the goal — the LLM will write a real next_step on the next
  // session. Logging via console.error is sufficient for v1; once
  // Sentry is wired (Phase 10) this would emit a tagged event.
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

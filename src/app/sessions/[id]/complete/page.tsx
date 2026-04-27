import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { supabaseForUser } from "@/lib/supabase";

import { NarrativeForm } from "./NarrativeForm";
import { WaitState } from "./WaitState";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  ended_at: string | null;
  is_substantive: boolean;
  coach_narrative: string | null;
  narrative_reflection_prompt: string | null;
  user_responded_at: string | null;
};

// Session Complete — the post-session screen. Three render branches:
//
//  1. Narrative not yet written (`coach_narrative IS NULL`): show the
//     wait-state. The v6 analysis runs in the background after the
//     End click; the wait-state polls via router.refresh until the
//     narrative lands on the row.
//  2. User has already responded (`user_responded_at IS NOT NULL`):
//     send them home. We don't expose a second-chance editor; the
//     response feeds Call 2 (response-parser) which runs once.
//  3. Otherwise: render the narrative + free-text reflection form.
//
// Abandoned sessions never hit this page (the cron processes them
// silently). Short non-substantive sessions also skip — the End
// action redirects them straight to /home.
export default async function SessionCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authSession = await auth();
  if (!authSession?.userId) redirect("/sign-in");

  const ctx = await supabaseForUser();
  if (!ctx) redirect("/sign-in");

  const { data, error } = await ctx.client
    .from("sessions")
    .select(
      "id, ended_at, is_substantive, coach_narrative, narrative_reflection_prompt, user_responded_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const session = data as SessionRow;

  // Not ended yet → bounce back to the active chat. Same guard as
  // before (this page is only meaningful post-end).
  if (!session.ended_at) {
    redirect(`/sessions/${id}`);
  }

  // Non-substantive sessions skip the analysis entirely; they should
  // never have been routed here, but if a user navigates directly
  // there's nothing to render — send them home.
  if (!session.is_substantive) {
    redirect("/home");
  }

  if (session.user_responded_at) {
    redirect("/home");
  }

  if (!session.coach_narrative) {
    return <WaitState />;
  }

  return (
    <NarrativeForm
      sessionId={id}
      coachNarrative={session.coach_narrative}
      reflectionPrompt={session.narrative_reflection_prompt}
    />
  );
}

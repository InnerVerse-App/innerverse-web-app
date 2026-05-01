import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getOnboardingState } from "@/lib/onboarding";
import { coachLabel } from "@/lib/onboarding-labels";
import { loadSessionForUser } from "@/lib/sessions";

import { ChatView } from "./ChatView";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;

  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const loaded = await loadSessionForUser(id);
  if (!loaded) notFound();

  const onboarding = await getOnboardingState();
  const coachName = coachLabel(onboarding?.coach_name);

  return (
    <ChatView
      sessionId={loaded.session.id}
      ended={loaded.session.ended_at != null}
      coachName={coachName}
      // ?mode=voice (set by startSession redirect) opens the chat in
      // voice mode; anything else (or absent) opens in text mode. The
      // existing in-session "Talk to your coach" / "Type instead"
      // toggle still works either way.
      initialVoiceMode={mode === "voice"}
      initialMessages={loaded.messages.map((m) => ({
        id: m.id,
        fromAi: m.is_sent_by_ai,
        content: m.content,
        createdAt: m.created_at,
      }))}
    />
  );
}

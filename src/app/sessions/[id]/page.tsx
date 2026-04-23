import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getOnboardingState } from "@/lib/onboarding";
import { loadSessionForUser } from "@/lib/sessions";
import { COACHES } from "@/app/onboarding/data";

import { ChatView } from "./ChatView";

export const dynamic = "force-dynamic";

function coachLabel(coachValue: string | null | undefined): string {
  if (!coachValue) return "your coach";
  return COACHES.find((c) => c.value === coachValue)?.label ?? coachValue;
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
      initialMessages={loaded.messages.map((m) => ({
        id: m.id,
        fromAi: m.is_sent_by_ai,
        content: m.content,
        createdAt: m.created_at,
      }))}
    />
  );
}

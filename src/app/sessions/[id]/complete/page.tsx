import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { loadSessionForUser } from "@/lib/sessions";

import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

// Session Complete — shown right after the End button for substantive
// sessions. Captures the reflection + 1–5 sliders from
// reference/screenshots/app-ui/app-screenshot-session-complete-*.PNG.
// Abandoned sessions never hit this page (the cron processes them
// silently); that matches operator intent to treat abandonment
// identically to clicking Skip on the form.
export default async function SessionCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  const loaded = await loadSessionForUser(id);
  if (!loaded) notFound();

  // A session that isn't ended yet shouldn't expose this page; send
  // the user back to the active chat. And only substantive sessions
  // route here intentionally — short sessions redirect to /home from
  // the endSession action, but if someone navigates here directly
  // we still let them submit feedback (schema allows it).
  if (!loaded.session.ended_at) {
    redirect(`/sessions/${id}`);
  }

  return <FeedbackForm sessionId={id} />;
}

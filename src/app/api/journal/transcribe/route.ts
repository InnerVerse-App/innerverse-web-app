import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { supabaseForUser } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whisper endpoint for journal voice entries. Mirrors
// /api/sessions/[id]/transcribe but without session-ownership
// scoping — journal entries belong directly to the user, so the
// Clerk session check is sufficient.
export async function POST(req: Request): Promise<Response> {
  const authSession = await auth();
  if (!authSession?.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ctx = await supabaseForUser();
  if (!ctx) {
    return NextResponse.json({ error: "no_session_token" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form_data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_audio_file" },
      { status: 400 },
    );
  }

  let text: string;
  try {
    // No sessionId — transcribeAudio's second arg is just a Sentry
    // tag and journal voice entries aren't tied to a session.
    text = await transcribeAudio(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcribe_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ text });
}

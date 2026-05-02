import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { supabaseForUser } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whisper transcription endpoint. The client posts a multipart/form-
// data body with `file` containing the recorded audio (any of the
// formats Whisper accepts: mp3, mp4, m4a, wav, webm, etc.). Returns
// the transcribed text as JSON — the client then sends that text
// through the existing /messages chat endpoint as a normal user turn,
// so the rest of the pipeline (chain, analyzer, calibration) is
// unchanged.
//
// Auth: Clerk session required. The session-ownership check ensures
// the caller can't transcribe audio against someone else's session id
// (RLS would block the eventual write anyway, but explicit guard
// fails cleanly with a 404 instead of a silent no-op).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  const authSession = await auth();
  if (!authSession?.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ctx = await supabaseForUser();
  if (!ctx) {
    return NextResponse.json({ error: "no_session_token" }, { status: 401 });
  }

  // Confirm the session exists and belongs to the caller. RLS already
  // restricts reads, so a foreign session id returns null here.
  const { data: sessionRow, error: sessionErr } = await ctx.client
    .from("sessions")
    .select("id, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    return NextResponse.json({ error: "session_check_failed" }, { status: 500 });
  }
  if (!sessionRow) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (sessionRow.ended_at) {
    return NextResponse.json({ error: "session_ended" }, { status: 409 });
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
  if (file.type && !file.type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "expected_audio_file" },
      { status: 400 },
    );
  }

  let text: string;
  try {
    text = await transcribeAudio(file, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcribe_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ text });
}

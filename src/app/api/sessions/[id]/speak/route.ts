import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getOnboardingState } from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";
import { synthesizeSpeech } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = { text?: unknown };

// OpenAI TTS endpoint. Body: { text: string }. Returns: streaming
// audio/mpeg (MP3 chunks) suitable for an HTML5 <audio> element via
// MediaSource or for direct playback if the client buffers the full
// response. The streaming path means the client can start playback
// before the full response is generated — important once the
// frontend wires this up to follow the chat-stream as it arrives.
//
// Auth + session-ownership are checked the same way as the transcribe
// endpoint. The text is then handed to synthesizeSpeech() which caps
// length and forwards to the OpenAI SDK.
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

  const { data: sessionRow, error: sessionErr } = await ctx.client
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    return NextResponse.json({ error: "session_check_failed" }, { status: 500 });
  }
  if (!sessionRow) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  // Look up the user's chosen coach so we can pick the matching voice.
  // The lookup is wrapped: a transient Supabase failure here is
  // cosmetic (worst case: one sentence in the default voice) and
  // shouldn't break voice mode for a chat reply that already arrived
  // successfully. Falls back to null → default voice.
  let coachName: string | null = null;
  try {
    const onboarding = await getOnboardingState();
    coachName = onboarding?.coach_name ?? null;
  } catch (err) {
    console.warn("speak route: coach lookup failed, using default voice", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  let audio: ReadableStream<Uint8Array>;
  try {
    audio = await synthesizeSpeech(text, sessionId, coachName);
  } catch (err) {
    const message = err instanceof Error ? err.message : "speak_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

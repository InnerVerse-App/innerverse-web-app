import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { Webhook } from "svix";
import { supabaseAdmin } from "@/lib/supabase";

// User-lifecycle webhook from Clerk. Clerk signs each request with svix;
// we verify the signature, then upsert or delete the corresponding row in
// public.users. Called by Clerk on user.created, user.updated,
// user.deleted events configured in the Clerk dashboard.
//
// This route is intentionally outside the Clerk middleware matcher
// (see src/middleware.ts) — signature verification is the auth layer
// here, not Clerk session state. Do NOT call Clerk's `auth()` from
// this route; there is no session context.
//
// public.users has no INSERT policy for the `authenticated` role, so
// this webhook (via service_role) is the only path that creates rows.

export const dynamic = "force-dynamic";

type ClerkEmailAddress = { id: string; email_address: string };

type ClerkUserData = {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ClerkEvent = {
  type: string;
  timestamp: number;
  data: ClerkUserData;
};

const PG_UNIQUE_VIOLATION = "23505";

function extractPrimaryEmail(data: ClerkUserData): string | null {
  const emails = data.email_addresses;
  if (!emails?.length) return null;
  const primaryId = data.primary_email_address_id;
  if (primaryId) {
    const match = emails.find((e) => e.id === primaryId);
    if (match) return match.email_address ?? null;
  }
  return emails[0].email_address ?? null;
}

function extractDisplayName(data: ClerkUserData): string | null {
  const parts = [data.first_name, data.last_name].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

function validateUserEvent(evt: unknown): ClerkEvent | null {
  if (typeof evt !== "object" || evt === null) return null;
  const e = evt as Record<string, unknown>;
  if (typeof e.type !== "string" || e.type.length === 0) return null;
  if (typeof e.timestamp !== "number" || !Number.isFinite(e.timestamp)) {
    return null;
  }
  if (typeof e.data !== "object" || e.data === null) return null;
  const data = e.data as Record<string, unknown>;
  if (typeof data.id !== "string" || data.id.length === 0) return null;
  return evt as ClerkEvent;
}

export async function POST(req: NextRequest) {
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  // Tag every Sentry event from this route with the svix-id so operator
  // can correlate a fired alert with the exact delivery in the Clerk /
  // Svix dashboard (F4 in KNOWN_FOLLOW_UPS 2026-04-22 webhook audit).
  Sentry.setTag("webhook", "clerk");
  if (svixId) Sentry.setTag("svix_id", svixId);

  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error(
      "clerk-webhook: CLERK_WEBHOOK_SIGNING_SECRET is not set; rejecting",
    );
    Sentry.captureMessage(
      "clerk-webhook: CLERK_WEBHOOK_SIGNING_SECRET not set",
      "error",
    );
    return NextResponse.json(
      { ok: false, reason: "not_configured" },
      { status: 500 },
    );
  }
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { ok: false, reason: "missing_signature_headers" },
      { status: 400 },
    );
  }

  const body = await req.text();

  let verified: unknown;
  try {
    const wh = new Webhook(signingSecret);
    verified = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.warn("clerk-webhook: signature verification failed", err);
    // Signature failures are expected for scanners / replayed events, but
    // a sustained spike means the signing secret rotated and Vercel env
    // wasn't updated. Capture so Sentry's rate view surfaces the pattern.
    Sentry.captureException(err, {
      tags: { webhook_stage: "invalid_signature" },
    });
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 },
    );
  }

  const eventType =
    typeof (verified as Record<string, unknown> | null)?.type === "string"
      ? (verified as { type: string }).type
      : null;

  // Ack unknown event types without inspecting their payload — they may
  // be valid Clerk events we just don't handle (e.g. organization.*).
  if (
    eventType !== "user.created" &&
    eventType !== "user.updated" &&
    eventType !== "user.deleted"
  ) {
    console.info("clerk-webhook: ignoring unknown event type", eventType);
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  const evt = validateUserEvent(verified);
  if (!evt) {
    console.error("clerk-webhook: invalid payload shape", { eventType });
    return NextResponse.json(
      { ok: false, reason: "invalid_payload" },
      { status: 400 },
    );
  }

  const supabase = supabaseAdmin();

  try {
    if (evt.type === "user.deleted") {
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", evt.data.id);
      if (error) {
        console.error("clerk-webhook: delete failed", {
          userId: evt.data.id,
          code: error.code,
          message: error.message,
        });
        Sentry.captureException(error, {
          tags: {
            webhook_stage: "db_error",
            clerk_event_type: evt.type,
            pg_code: error.code ?? "unknown",
          },
          extra: { userId: evt.data.id, message: error.message },
        });
        return NextResponse.json(
          { ok: false, reason: "db_error" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, action: "user.deleted" });
    }

    const eventAt = new Date(evt.timestamp).toISOString();
    const { error } = await supabase.rpc("upsert_user_from_clerk", {
      p_id: evt.data.id,
      p_display_name: extractDisplayName(evt.data),
      p_email: extractPrimaryEmail(evt.data),
      p_event_at: eventAt,
    });
    if (error) {
      // 23505 = email collision (another row already owns this email).
      // 200 to stop Svix's retry loop; row's other fields and last_event_at
      // are NOT updated this call — operator reconciles manually.
      if (error.code === PG_UNIQUE_VIOLATION) {
        console.error("clerk-webhook: email collision, not retrying", {
          type: evt.type,
          userId: evt.data.id,
          code: error.code,
          message: error.message,
        });
        // 200-ack'd to Svix but operator still needs to see this — an
        // email collision blocks the user's row from updating until it's
        // resolved manually (F2 in KNOWN_FOLLOW_UPS 2026-04-22 webhook).
        Sentry.captureMessage(
          "clerk-webhook: email collision",
          {
            level: "warning",
            tags: {
              webhook_stage: "email_collision",
              clerk_event_type: evt.type,
            },
            extra: { userId: evt.data.id, message: error.message },
          },
        );
        return NextResponse.json({ ok: true, action: "email_collision" });
      }
      console.error("clerk-webhook: upsert failed", {
        type: evt.type,
        userId: evt.data.id,
        code: error.code,
        message: error.message,
      });
      Sentry.captureException(error, {
        tags: {
          webhook_stage: "db_error",
          clerk_event_type: evt.type,
          pg_code: error.code ?? "unknown",
        },
        extra: { userId: evt.data.id, message: error.message },
      });
      return NextResponse.json(
        { ok: false, reason: "db_error" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, action: evt.type });
  } catch (err) {
    console.error(
      "clerk-webhook: unexpected error",
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { raw: String(err) },
    );
    Sentry.captureException(err, {
      tags: { webhook_stage: "unexpected_error" },
    });
    return NextResponse.json(
      { ok: false, reason: "unexpected_error" },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
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
// Paired with migrations:
//   - 20260422062124_identity_tables.sql (users + onboarding_selections)
//   - 20260422150000_users_event_ordering.sql (last_event_at column +
//     upsert_user_from_clerk function for race-safe ordering)
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

// Postgres SQLSTATE for unique_violation. Hit when a user.updated
// tries to set an email already held by another row
// (Audit 2026-04-22 F2).
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

// Validate the post-signature payload shape (Audit 2026-04-22 F3).
// Svix proves the payload came from Clerk; this proves the payload
// has the fields we read before we dereference them.
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
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error(
      "clerk-webhook: CLERK_WEBHOOK_SIGNING_SECRET is not set; rejecting",
    );
    return NextResponse.json(
      { ok: false, reason: "not_configured" },
      { status: 500 },
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
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
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 },
    );
  }

  const supabase = supabaseAdmin();

  try {
    const eventType =
      typeof (verified as { type?: unknown })?.type === "string"
        ? (verified as { type: string }).type
        : null;

    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const evt = validateUserEvent(verified);
        if (!evt) {
          console.error("clerk-webhook: invalid payload shape", { eventType });
          return NextResponse.json(
            { ok: false, reason: "invalid_payload" },
            { status: 400 },
          );
        }
        const eventAt = new Date(evt.timestamp).toISOString();
        const { error } = await supabase.rpc("upsert_user_from_clerk", {
          p_id: evt.data.id,
          p_display_name: extractDisplayName(evt.data),
          p_email: extractPrimaryEmail(evt.data),
          p_event_at: eventAt,
        });
        if (error) {
          if (error.code === PG_UNIQUE_VIOLATION) {
            // Email collision (another row already owns this email).
            // 200 to stop Svix's retry loop; the row's other fields
            // and last_event_at are NOT updated this call. Operator
            // must reconcile manually. Tracked as Audit 2026-04-22 F2.
            console.error("clerk-webhook: email collision, not retrying", {
              type: evt.type,
              userId: evt.data.id,
              code: error.code,
              message: error.message,
            });
            return NextResponse.json({
              ok: true,
              action: "email_collision",
            });
          }
          console.error("clerk-webhook: upsert failed", {
            type: evt.type,
            userId: evt.data.id,
            code: error.code,
            message: error.message,
          });
          return NextResponse.json(
            { ok: false, reason: "db_error" },
            { status: 500 },
          );
        }
        return NextResponse.json({ ok: true, action: evt.type });
      }
      case "user.deleted": {
        const evt = validateUserEvent(verified);
        if (!evt) {
          console.error("clerk-webhook: invalid payload shape", { eventType });
          return NextResponse.json(
            { ok: false, reason: "invalid_payload" },
            { status: 400 },
          );
        }
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
          return NextResponse.json(
            { ok: false, reason: "db_error" },
            { status: 500 },
          );
        }
        return NextResponse.json({ ok: true, action: "user.deleted" });
      }
      default: {
        // Log and acknowledge unknown event types so Clerk doesn't retry.
        console.info("clerk-webhook: ignoring unknown event type", eventType);
        return NextResponse.json({ ok: true, action: "ignored" });
      }
    }
  } catch (err) {
    console.error(
      "clerk-webhook: unexpected error",
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { raw: String(err) },
    );
    return NextResponse.json(
      { ok: false, reason: "unexpected_error" },
      { status: 500 },
    );
  }
}

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
// here, not Clerk session state.
//
// Paired with the migration in 20260422062124_identity_tables.sql:
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
  data: ClerkUserData;
};

function extractPrimaryEmail(data: ClerkUserData): string | null {
  const emails = data.email_addresses;
  if (!emails?.length) return null;
  const primaryId = data.primary_email_address_id;
  if (primaryId) {
    const match = emails.find((e) => e.id === primaryId);
    if (match) return match.email_address;
  }
  return emails[0].email_address;
}

function extractDisplayName(data: ClerkUserData): string | null {
  const parts = [data.first_name, data.last_name].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : null;
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

  let evt: ClerkEvent;
  try {
    const wh = new Webhook(signingSecret);
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.warn("clerk-webhook: signature verification failed", err);
    return NextResponse.json(
      { ok: false, reason: "invalid_signature" },
      { status: 400 },
    );
  }

  const supabase = supabaseAdmin();

  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated": {
        const { error } = await supabase.from("users").upsert(
          {
            id: evt.data.id,
            display_name: extractDisplayName(evt.data),
            email: extractPrimaryEmail(evt.data),
          },
          { onConflict: "id" },
        );
        if (error) {
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
        console.info("clerk-webhook: ignoring unknown event type", evt.type);
        return NextResponse.json({ ok: true, action: "ignored" });
      }
    }
  } catch (err) {
    console.error("clerk-webhook: unexpected error", err);
    return NextResponse.json(
      { ok: false, reason: "unexpected_error" },
      { status: 500 },
    );
  }
}

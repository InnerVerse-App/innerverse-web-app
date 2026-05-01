"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { supabaseAdmin } from "@/lib/supabase";

// Self-serve account deletion. Two things have to happen, in order:
// (1) Clerk deletes the user record — invalidates their session
//     immediately and stops them from signing back in. This is the
//     authoritative "user is gone" event.
// (2) The public.users row is deleted, which cascades through every
//     user-owned table (sessions, messages, breakthroughs, insights,
//     goals, etc.) via ON DELETE CASCADE.
//
// (2) is also done by the existing user.deleted Clerk webhook
// (api/clerk-webhook/route.ts). We do it inline as a belt-and-
// suspenders measure: the user expects their data gone NOW, not
// "whenever the webhook eventually fires." If the inline delete
// fails for any reason, the webhook is the authoritative cleanup
// path — so the inline failure is logged but not thrown.
export async function deleteAccount(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.userId) redirect("/sign-in");

  // The form input is a "type DELETE to confirm" gate. The client
  // disables the submit button until it matches; we re-check
  // server-side because actions are independently callable.
  const raw = formData.get("confirmation");
  const confirmation = typeof raw === "string" ? raw.trim() : "";
  if (confirmation !== "DELETE") {
    redirect("/settings");
  }

  const userId = session.userId;

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (err) {
    console.error("deleteAccount: clerk deletion failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  try {
    const admin = supabaseAdmin();
    const { error } = await admin.from("users").delete().eq("id", userId);
    if (error) throw error;
  } catch (err) {
    // Not fatal — the user.deleted webhook is the authoritative path
    // and will retry. Logged so the operator sees if a transient
    // Supabase error caused the user's data to linger past the
    // expected sub-second window.
    console.error(
      "deleteAccount: supabase delete failed; webhook will reconcile",
      {
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }

  // Clerk has already invalidated the session. Splash is public so
  // the redirect lands cleanly even with a now-stale cookie.
  redirect("/");
}

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Server-side Supabase client using the service_role key.
 *
 * Bypasses Row Level Security. Use only in trusted server code
 * (API route handlers, server components, server actions).
 * Never import this from client components or browser code — the
 * `server-only` import at the top of this file makes the build
 * fail loudly if a client module tries.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type UserSupabase = {
  client: SupabaseClient;
  userId: string;
};

/**
 * RLS-scoped Supabase client + the Clerk userId it was built with.
 * Returns null when there's no Clerk session. Bundling the userId
 * with the client lets callers avoid a second `auth()` round-trip.
 *
 * Token caveat: the token is captured at client-creation time. Clerk
 * session tokens are short-lived (minutes); long-running operations
 * that exceed the token TTL may have tail queries rejected. Re-create
 * the client between phases of a long server action. Today's call
 * sites are short.
 */
export async function supabaseForUser(): Promise<UserSupabase | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const session = await auth();
  if (typeof session?.getToken !== "function" || !session.userId) {
    return null;
  }
  const token = await session.getToken();
  if (!token) {
    console.warn("supabaseForUser: no Clerk session token");
    return null;
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, userId: session.userId };
}

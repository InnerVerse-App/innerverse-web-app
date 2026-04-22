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

/**
 * Server-side Supabase client scoped to the current Clerk user.
 * Pairs with Supabase RLS: queries see only rows the signed-in user
 * is permitted to read. Returns null when no Clerk session is active
 * OR when the Clerk SDK shape unexpectedly differs (defensive shape
 * guard — Audit 2026-04-22 F16).
 *
 * Server-only (`server-only` import at the top of this file).
 *
 * Relies on the Clerk → Supabase third-party auth integration: Supabase
 * is configured to trust JWTs from the Clerk JWKS endpoint, so the
 * standard Clerk session token (no JWT template required) is enough.
 *
 * Token caveat (Audit F23): the token is captured at client-creation
 * time. Long-running operations that exceed the token TTL (~minutes)
 * may have tail queries rejected. For long server actions, re-create
 * the client between phases. Today's call sites are short.
 */
export async function supabaseForUser(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const session = await auth();
  if (typeof session?.getToken !== "function") {
    return null;
  }
  const token = await session.getToken();
  if (!token) {
    console.warn(
      "supabaseForUser: no Clerk session token — caller will receive null",
    );
    return null;
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Server-side Supabase client using the service_role key.
 *
 * Bypasses Row Level Security. Use only in trusted server code
 * (API route handlers, server components, server actions).
 * Never import this from client components or browser code.
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
 * is permitted to read. Returns null when no Clerk session is active.
 *
 * Server-only: imports `auth()` from `@clerk/nextjs/server`, which
 * throws opaquely if called from a client component. Use only in API
 * route handlers, server components, and server actions. Never import
 * this from client components or browser code.
 *
 * Relies on the Clerk → Supabase third-party auth integration: Supabase
 * is configured to trust JWTs from the Clerk JWKS endpoint, so the
 * standard Clerk session token (no JWT template required) is enough.
 */
export async function supabaseForUser(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

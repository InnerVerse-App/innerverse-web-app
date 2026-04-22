import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SUPABASE_FETCH_TIMEOUT_MS = 3000;

export async function GET() {
  try {
    supabaseAdmin();
  } catch (err) {
    console.error("healthcheck: env check failed", err);
    return NextResponse.json(
      { ok: false, reason: "env_missing" },
      { status: 500 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS),
    });
    return NextResponse.json({
      ok: response.ok,
      supabase: response.ok ? "reachable" : "unreachable",
      status: response.status,
    });
  } catch (err) {
    console.error("healthcheck: supabase fetch failed", err);
    return NextResponse.json(
      { ok: false, reason: "fetch_failed" },
      { status: 503 },
    );
  }
}

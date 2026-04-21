import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    supabaseAdmin();
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "env_missing", error: String(err) },
      { status: 500 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return NextResponse.json({
      ok: response.ok,
      supabase: response.ok ? "reachable" : "unreachable",
      status: response.status,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", error: String(err) },
      { status: 503 },
    );
  }
}

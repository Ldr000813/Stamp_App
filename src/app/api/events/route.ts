import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  const now = Date.now();
  const from = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
  const to = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("events")
    .select("*, spot:spots(id,name_ja,name_en,lat,lng,image_url,map_url)")
    .eq("active", true)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });
  return NextResponse.json({ events: data || [] });
}

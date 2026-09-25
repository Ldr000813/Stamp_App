import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const now = Date.now();
  const spotId = req.nextUrl.searchParams.get("spotId");

  // Spot detail: that spot's upcoming events (from ~now onward, no upper bound).
  if (spotId) {
    const fromIso = new Date(now - 3 * 3600 * 1000).toISOString(); // keep events that started in the last few hours
    const { data } = await db
      .from("events")
      .select("*, spot:spots(id,name_ja,name_en,map_url)")
      .eq("active", true)
      .eq("spot_id", spotId)
      .gte("starts_at", fromIso)
      .order("starts_at", { ascending: true });
    return NextResponse.json({ events: data || [] });
  }

  // Feed: everything from 2 days ago to 1 week ahead.
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

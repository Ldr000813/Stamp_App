import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;

// End reference: the event's end time, or its start time if no end is set.
const endRef = (e: any) => new Date(e.ends_at || e.starts_at).getTime();

// Decorate + filter for the user-facing screens:
//   - ended:   true once the current time passes the end time.
//   - visible: hidden 24h after the end time (row stays in the DB).
function forUsers(rows: any[], now: number) {
  return (rows || [])
    .map((e) => ({ ...e, ended: now > endRef(e) }))
    .filter((e) => now <= endRef(e) + DAY);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const now = Date.now();
  const spotId = req.nextUrl.searchParams.get("spotId");

  // A few days back so recently-ended events (still within the 24h grace) are caught.
  const from = new Date(now - 3 * DAY).toISOString();

  // Spot detail: this spot's upcoming + recently-ended events.
  if (spotId) {
    const { data } = await db
      .from("events")
      .select("*, spot:spots(id,name_ja,name_en,map_url,lat,lng)")
      .eq("active", true)
      .eq("spot_id", spotId)
      .gte("starts_at", from)
      .order("starts_at", { ascending: true });
    return NextResponse.json({ events: forUsers(data || [], now) });
  }

  // Feed: from a few days ago to ~2 months ahead.
  const to = new Date(now + 60 * DAY).toISOString();
  const { data } = await db
    .from("events")
    .select("*, spot:spots(id,name_ja,name_en,lat,lng,image_url,map_url,address_ja,address_en)")
    .eq("active", true)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });
  return NextResponse.json({ events: forUsers(data || [], now) });
}

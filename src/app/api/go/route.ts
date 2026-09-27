import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Expand a Google Maps share link (maps.app.goo.gl/...) to its final place-profile
// URL. The expanded URL keeps the place identity, so it opens the exact building
// profile and never triggers the "サポートされていないリンク" error the short link does.
async function expand(link: string): Promise<string | null> {
  try {
    const res = await fetch(link, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36" },
    });
    let final = res.url || "";
    if (final.includes("consent.google")) {
      try { const c = new URL(final).searchParams.get("continue"); if (c) final = decodeURIComponent(c); } catch { /* ignore */ }
    }
    if (final && !final.includes("goo.gl") && !final.includes("consent.google")) return final;
    return null;
  } catch {
    return null;
  }
}

// /api/go?spot=<id>  ->  302 redirect to the openable place profile for that spot.
export async function GET(req: NextRequest) {
  const fallback = "https://www.google.com/maps";
  const spotId = req.nextUrl.searchParams.get("spot");
  if (!spotId) return NextResponse.redirect(fallback, 302);

  const db = supabaseAdmin();
  const { data: spot } = await db.from("spots")
    .select("map_url, lat, lng, name_ja, address_ja").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.redirect(fallback, 302);

  let target = "";
  if (spot.map_url) { const e = await expand(spot.map_url); if (e) target = e; }
  if (!target && spot.lat != null && spot.lng != null)
    target = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  if (!target && (spot.address_ja || spot.name_ja))
    target = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.address_ja || spot.name_ja)}`;
  if (!target) target = spot.map_url || fallback;

  return NextResponse.redirect(target, 302);
}

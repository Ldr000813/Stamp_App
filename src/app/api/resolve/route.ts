import { NextRequest, NextResponse } from "next/server";
import { extractLatLng } from "@/lib/mapurl";

export const dynamic = "force-dynamic";

// Follow a Google Maps short link and extract coordinates from the resolved URL/body.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    const finalUrl = res.url || "";
    const body = await res.text().catch(() => "");
    const hay = finalUrl + " " + body;
    const coord = extractLatLng(hay);
    if (coord) return NextResponse.json(coord);
    return NextResponse.json({ error: "not_found" });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

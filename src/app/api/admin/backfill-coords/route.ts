import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";
import { resolveCoords } from "@/lib/resolveCoords";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin: re-resolve every spot's saved Google Maps link into accurate pin
// coordinates and store them, so the overall map shows correct pins.
export async function POST(req: NextRequest) {
  if (!isAdminEmail(await getAuthEmail(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: spots } = await db.from("spots").select("id, name_ja, map_url");
  const results: any[] = [];
  for (const s of spots || []) {
    if (!s.map_url) { results.push({ name: s.name_ja, status: "no_link" }); continue; }
    const c = await resolveCoords(s.map_url);
    if (c) {
      await db.from("spots").update({ lat: c.lat, lng: c.lng }).eq("id", s.id);
      results.push({ name: s.name_ja, lat: c.lat, lng: c.lng });
    } else {
      results.push({ name: s.name_ja, status: "unresolved" });
    }
  }
  return NextResponse.json({ ok: true, updated: results.filter((r) => r.lat != null).length, results });
}

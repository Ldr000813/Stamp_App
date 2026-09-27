import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { extractLatLng } from "@/lib/mapurl";

export const dynamic = "force-dynamic";

// Resolve the admin's Google Maps *share link* (e.g. maps.app.goo.gl/xxx) into the
// fully-expanded place URL. That expanded URL keeps the place identity, so opening
// it shows the exact building profile (no drift to random coordinates) and never
// triggers the "サポートされていないリンク" error the short links sometimes cause.
// We also grab coordinates (for the Leaflet map pins) as a bonus.
async function resolvePlace(link: string): Promise<{ url: string | null; lat: number | null; lng: number | null }> {
  try {
    const res = await fetch(link, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36" },
    });
    let finalUrl = res.url || "";
    // A consent interstitial hides the real destination in ?continue=
    if (finalUrl.includes("consent.google")) {
      try { const c = new URL(finalUrl).searchParams.get("continue"); if (c) finalUrl = decodeURIComponent(c); } catch { /* ignore */ }
    }
    const body = await res.text().catch(() => "");
    const coord = extractLatLng(finalUrl + " " + body);

    let placeUrl: string | null = null;
    if (/\/maps\/place\//.test(finalUrl)) placeUrl = finalUrl;
    if (!placeUrl) {
      const m = body.match(/https:\/\/www\.google\.com\/maps\/place\/[^"'\\<> )]+/);
      if (m) placeUrl = m[0].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
    }
    if (!placeUrl && /google\.[^/]+\/maps|maps\.google/.test(finalUrl)) placeUrl = finalUrl;
    return { url: placeUrl, lat: coord?.lat ?? null, lng: coord?.lng ?? null };
  } catch {
    return { url: null, lat: null, lng: null };
  }
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon);
  const { data } = await client.auth.getUser(token);
  const email = data.user?.email;
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) return null;
  return email;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data } = await db.from("spots").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ spots: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.name_ja || !b.name_en) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const db = supabaseAdmin();
  const row = {
    type: b.type === "event" ? "event" : "spot",
    name_ja: b.name_ja,
    name_en: b.name_en,
    description_ja: b.description_ja || null,
    description_en: b.description_en || null,
    address_ja: b.address_ja || null,
    address_en: b.address_en || null,
    image_url: b.image_url || null,
    map_url: b.map_url || null,
    owner_email: b.owner_email ? String(b.owner_email).trim().toLowerCase() : null,
    category: b.category || null,
    lat: b.lat !== "" && b.lat != null ? Number(b.lat) : null,
    lng: b.lng !== "" && b.lng != null ? Number(b.lng) : null,
    event_start: b.event_start || null,
    event_end: b.event_end || null,
  };
  // Resolve the pasted share link to coordinates (used for the map pins).
  if (row.map_url) {
    const r = await resolvePlace(row.map_url);
    if (r.lat != null) { row.lat = r.lat; row.lng = r.lng; }
  }
  const { data: inserted, error } = await db.from("spots").insert(row).select("id").single();
  if (error || !inserted) return NextResponse.json({ error: error?.message || "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  // campaign_spots cascade; stamps are preserved (spot_id -> null via 006 migration) so collected stamps are never lost.
  const { error } = await db.from("spots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const id = b?.id;
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const allowed = ["type","name_ja","name_en","description_ja","description_en","address_ja","address_en","image_url","map_url","owner_email","category","lat","lng","event_start","event_end","active"];
  const update: any = {};
  for (const k of allowed) if (k in b) update[k] = b[k] === "" ? null : b[k];
  if (update.owner_email) update.owner_email = String(update.owner_email).trim().toLowerCase();
  if ("lat" in update) update.lat = update.lat == null ? null : Number(update.lat);
  if ("lng" in update) update.lng = update.lng == null ? null : Number(update.lng);
  // Re-resolve coordinates whenever the map link is set/changed (for map pins).
  if ("map_url" in update && update.map_url) {
    const r = await resolvePlace(update.map_url);
    if (r.lat != null) { update.lat = r.lat; update.lng = r.lng; }
  }
  const db = supabaseAdmin();
  const { error } = await db.from("spots").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

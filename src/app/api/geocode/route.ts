import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type R = { label: string; lat: number; lng: number };

// Google Places Text Search — POI-level, "like Google Maps". Needs GOOGLE_MAPS_API_KEY + billing.
async function google(q: string, key: string): Promise<R[]> {
  const out: R[] = [];
  try {
    const r = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&language=ja&region=jp&key=${key}`,
      { cache: "no-store" }
    );
    const d = await r.json();
    for (const p of (d.results || []).slice(0, 8)) {
      const loc = p.geometry?.location;
      if (loc) out.push({ label: [p.name, p.formatted_address].filter(Boolean).join(" — "), lat: loc.lat, lng: loc.lng });
    }
  } catch {}
  return out;
}

// GSI (国土地理院) — Japanese ADDRESS geocoder (no POIs).
async function gsi(q: string): Promise<R[]> {
  const out: R[] = [];
  try {
    const r = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const d = await r.json();
    for (const f of (Array.isArray(d) ? d : []).slice(0, 5)) {
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length >= 2) out.push({ label: f?.properties?.title || q, lat: Number(c[1]), lng: Number(c[0]) });
    }
  } catch {}
  return out;
}

// Nominatim (OpenStreetMap) — has POIs (coverage varies in Japan). Free, no key.
async function nominatim(q: string): Promise<R[]> {
  const out: R[] = [];
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&accept-language=ja&countrycodes=jp&addressdetails=0`,
      { headers: { "User-Agent": "kyoto-stamp-rally/1.0 (admin geocoder)" }, cache: "no-store" }
    );
    const d = await r.json();
    for (const f of (Array.isArray(d) ? d : [])) out.push({ label: f.display_name, lat: parseFloat(f.lat), lng: parseFloat(f.lon) });
  } catch {}
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.trim()) return NextResponse.json({ results: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  let results: R[] = [];

  if (key) {
    results = await google(q, key);
    if (results.length === 0) results = [...(await nominatim(q)), ...(await gsi(q))];
  } else {
    // POI-capable (Nominatim) first for place/store names, then address (GSI).
    const [nom, g] = await Promise.all([nominatim(q), gsi(q)]);
    results = [...nom, ...g];
  }

  // De-duplicate by ~11m.
  const seen = new Set<string>();
  results = results.filter((r) => {
    if (!isFinite(r.lat) || !isFinite(r.lng)) return false;
    const k = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json({ results: results.slice(0, 8) });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail, canManageSpotDecision } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// Returns the caller's owned spot ids (or null = admin, meaning "all").
async function ownedSpotIds(db: any, email: string): Promise<string[] | null> {
  if (isAdminEmail(email)) return null;
  const { data } = await db.from("spots").select("id").eq("owner_email", email);
  return (data || []).map((s: any) => s.id);
}
async function canManageSpot(db: any, email: string, spotId: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (!spotId) return false;
  const { data } = await db.from("spots").select("owner_email").eq("id", spotId).maybeSingle();
  return canManageSpotDecision(email, data?.owner_email, false);
}

export async function GET(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const ids = await ownedSpotIds(db, email);
  let q = db.from("events").select("*, spot:spots(id,name_ja,name_en)").order("starts_at", { ascending: true });
  if (ids !== null) {
    if (ids.length === 0) return NextResponse.json({ events: [] });
    q = q.in("spot_id", ids);
  }
  const { data } = await q;
  return NextResponse.json({ events: data || [] });
}

export async function POST(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.title_ja || !b.title_en || !b.starts_at) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const db = supabaseAdmin();
  if (!(await canManageSpot(db, email, b.spot_id || null)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data, error } = await db.from("events").insert({
    spot_id: b.spot_id || null,
    title_ja: b.title_ja, title_en: b.title_en,
    description_ja: b.description_ja || null, description_en: b.description_en || null,
    image_url: b.image_url || null,
    starts_at: b.starts_at, ends_at: b.ends_at || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "insert_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  // Verify the caller owns the event's current spot.
  const { data: ev } = await db.from("events").select("spot_id").eq("id", b.id).maybeSingle();
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canManageSpot(db, email, ev.spot_id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Owners may edit content/time only — never move an event to another spot.
  const allowed = ["title_ja","title_en","description_ja","description_en","image_url","starts_at","ends_at"];
  const update: any = {};
  for (const k of allowed) if (k in b) update[k] = b[k] === "" ? null : b[k];
  const { error } = await db.from("events").update(update).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const email = await getAuthEmail(req);
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: ev } = await db.from("events").select("spot_id").eq("id", id).maybeSingle();
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canManageSpot(db, email, ev.spot_id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { error } = await db.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

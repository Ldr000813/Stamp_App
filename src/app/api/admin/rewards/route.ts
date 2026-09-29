import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getAuthEmail, isAdminEmail } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

async function activeCampaignId(db: any): Promise<string | null> {
  const { data } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

// Replace a card's link rows (card_spots / card_coupons) with the given ids.
async function syncLinks(db: any, table: string, col: string, rewardId: string, ids: string[]) {
  await db.from(table).delete().eq("reward_id", rewardId);
  const rows = (ids || []).filter(Boolean).map((id: string) => ({ reward_id: rewardId, [col]: id }));
  if (rows.length) await db.from(table).insert(rows);
}

export async function GET(req: NextRequest) {
  if (!isAdminEmail(await getAuthEmail(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: rewards } = await db.from("rewards").select("*").order("created_at", { ascending: true });
  const ids = (rewards || []).map((r: any) => r.id);
  const spotsByCard: Record<string, string[]> = {};
  const couponsByCard: Record<string, string[]> = {};
  if (ids.length) {
    const { data: cs } = await db.from("card_spots").select("reward_id, spot_id").in("reward_id", ids);
    for (const r of cs || []) (spotsByCard[r.reward_id] ||= []).push(r.spot_id);
    const { data: cc } = await db.from("card_coupons").select("reward_id, coupon_id").in("reward_id", ids);
    for (const r of cc || []) (couponsByCard[r.reward_id] ||= []).push(r.coupon_id);
  }
  const out = (rewards || []).map((r: any) => ({
    ...r, spot_ids: spotsByCard[r.id] || [], coupon_ids: couponsByCard[r.id] || [],
  }));
  return NextResponse.json({ rewards: out });
}

export async function POST(req: NextRequest) {
  if (!isAdminEmail(await getAuthEmail(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.title_ja) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const db = supabaseAdmin();
  const campaign_id = await activeCampaignId(db);
  const req_n = Math.max(1, parseInt(b.required_stamps, 10) || 5);
  const { data, error } = await db.from("rewards").insert({
    campaign_id,
    title_ja: b.title_ja, title_en: b.title_en || null,
    body_ja: b.body_ja || null, body_en: b.body_en || null,
    image_url: b.image_url || null,
    required_stamps: req_n,
    recurring: !!b.recurring,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "insert_failed" }, { status: 500 });
  await syncLinks(db, "card_spots", "spot_id", data.id, b.spot_ids || []);
  await syncLinks(db, "card_coupons", "coupon_id", data.id, b.coupon_ids || []);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminEmail(await getAuthEmail(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const allowed = ["title_ja","title_en","body_ja","body_en","image_url","required_stamps","active","recurring"];
  const update: any = {};
  for (const k of allowed) if (k in b) update[k] = b[k] === "" ? null : b[k];
  if ("required_stamps" in update) update.required_stamps = Math.max(1, parseInt(update.required_stamps, 10) || 5);
  const db = supabaseAdmin();
  const { error } = await db.from("rewards").update(update).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (Array.isArray(b.spot_ids)) await syncLinks(db, "card_spots", "spot_id", b.id, b.spot_ids);
  if (Array.isArray(b.coupon_ids)) await syncLinks(db, "card_coupons", "coupon_id", b.id, b.coupon_ids);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAdminEmail(await getAuthEmail(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("rewards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

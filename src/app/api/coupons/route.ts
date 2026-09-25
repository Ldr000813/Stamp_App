import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = supabaseAdmin();
  const { data: campaign } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ coupons: [], redeemed: [] });

  const { data: coupons } = await db.from("coupons")
    .select("*").eq("campaign_id", campaign.id).eq("active", true)
    .order("created_at", { ascending: true });

  let redeemed: Record<string, string> = {};
  if (participantId) {
    const { data: reds } = await db.from("coupon_redemptions")
      .select("coupon_id, redeemed_at").eq("participant_id", participantId);
    for (const r of reds || []) redeemed[r.coupon_id] = r.redeemed_at;
  }
  return NextResponse.json({ coupons: coupons || [], redeemed });
}

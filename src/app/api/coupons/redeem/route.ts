import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// A user marks a coupon as used (slide-to-redeem). Idempotent.
export async function POST(req: NextRequest) {
  const { participantId, couponId } = await req.json().catch(() => ({}));
  if (!participantId || !couponId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: coupon } = await db.from("coupons").select("id, active").eq("id", couponId).maybeSingle();
  if (!coupon || !coupon.active) return NextResponse.json({ error: "coupon_not_found" }, { status: 404 });

  const { error } = await db.from("coupon_redemptions")
    .insert({ coupon_id: couponId, participant_id: participantId });
  const already = !!error && (error as any).code === "23505";
  if (error && !already) return NextResponse.json({ error: "redeem_failed" }, { status: 500 });

  const { data: row } = await db.from("coupon_redemptions")
    .select("redeemed_at").eq("coupon_id", couponId).eq("participant_id", participantId).maybeSingle();
  return NextResponse.json({ ok: true, already, redeemed_at: row?.redeemed_at });
}

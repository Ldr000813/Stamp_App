import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Redeem a granted coupon (slide-to-use). Blocked if expired or already used.
export async function POST(req: NextRequest) {
  const { participantId, grantId } = await req.json().catch(() => ({}));
  if (!participantId || !grantId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const db = supabaseAdmin();

  const { data: grant } = await db.from("coupon_grants")
    .select("id, participant_id, expires_at, redeemed_at").eq("id", grantId).maybeSingle();
  if (!grant || grant.participant_id !== participantId)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (grant.redeemed_at)
    return NextResponse.json({ ok: true, already: true, redeemed_at: grant.redeemed_at });
  if (Date.now() > new Date(grant.expires_at).getTime())
    return NextResponse.json({ error: "expired" }, { status: 410 });

  const redeemed_at = new Date().toISOString();
  const { error } = await db.from("coupon_grants").update({ redeemed_at }).eq("id", grantId);
  if (error) return NextResponse.json({ error: "redeem_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, redeemed_at });
}

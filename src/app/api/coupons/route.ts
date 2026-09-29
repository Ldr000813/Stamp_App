import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Returns the coupons GRANTED to this participant (earned by completing a stamp
// card). Each grant has its own expiry and redeemed state.
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ grants: [] });
  const db = supabaseAdmin();

  const { data } = await db.from("coupon_grants")
    .select("id, granted_at, expires_at, redeemed_at, coupon:coupons(id, title_ja, title_en, description_ja, description_en, image_url)")
    .eq("participant_id", participantId)
    .order("granted_at", { ascending: false });

  const now = Date.now();
  const grants = (data || []).map((g: any) => ({
    ...g,
    expired: now > new Date(g.expires_at).getTime(),
  }));
  return NextResponse.json({ grants });
}

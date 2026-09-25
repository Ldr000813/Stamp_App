import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ acquired: [] });
  const db = supabaseAdmin();
  const { data: campaign } = await db
    .from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ acquired: [] });
  const { data } = await db.from("stamps")
    .select("spot_id, spot_name_ja, spot_name_en, spot_image_url, acquired_at")
    .eq("participant_id", participantId).eq("campaign_id", campaign.id)
    .order("acquired_at", { ascending: true });
  const stamps = data || [];
  return NextResponse.json({ acquired: stamps.map((s) => s.spot_id).filter(Boolean), stamps });
}

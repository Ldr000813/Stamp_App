import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { participantId, spotToken } = await req.json().catch(() => ({}));
  if (!participantId || !spotToken)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const db = supabaseAdmin();

  const { data: spot } = await db.from("spots").select("id, active, name_ja, name_en, image_url").eq("token", spotToken).maybeSingle();
  if (!spot || !spot.active) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });

  const { data: campaign } = await db
    .from("campaigns").select("id, required_stamps").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "no_campaign" }, { status: 404 });

  // MVP: any active spot counts toward the active campaign
  // (no campaign_spots requirement — re-add the join check for multi-campaign later).
  const { error: insErr } = await db.from("stamps").insert({
    participant_id: participantId, campaign_id: campaign.id, spot_id: spot.id,
    spot_name_ja: spot.name_ja, spot_name_en: spot.name_en, spot_image_url: spot.image_url,
  });
  const already = !!insErr && insErr.code === "23505"; // unique_violation
  if (insErr && !already) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const { count } = await db.from("stamps")
    .select("*", { count: "exact", head: true })
    .eq("participant_id", participantId).eq("campaign_id", campaign.id);

  return NextResponse.json({ already, done: count || 0, total: campaign.required_stamps });
}

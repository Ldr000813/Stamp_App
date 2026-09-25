import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { rewardProgress } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = supabaseAdmin();
  const { data: campaign } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ rewards: [] });

  const { data: rewards } = await db.from("rewards")
    .select("*").eq("campaign_id", campaign.id).eq("active", true)
    .order("required_stamps", { ascending: true });

  // Fetch this participant's stamp timestamps once, then compute each reward's
  // progress = number of stamps acquired at or after the reward's created_at.
  let stampTimes: number[] = [];
  if (participantId) {
    const { data: stamps } = await db.from("stamps")
      .select("acquired_at").eq("participant_id", participantId).eq("campaign_id", campaign.id);
    stampTimes = (stamps || []).map((s: any) => new Date(s.acquired_at).getTime());
  }

  const out = (rewards || []).map((r: any) => ({
    ...r, ...rewardProgress(stampTimes, r.created_at, r.required_stamps),
  }));
  return NextResponse.json({ rewards: out });
}

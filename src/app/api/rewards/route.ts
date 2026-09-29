import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// Returns the participant's stamp cards, each with its CURRENT cycle progress
// and the stamps collected in that cycle (for the grid). Recurring cards reset
// each completion, so progress reflects the ongoing cycle.
export async function GET(req: NextRequest) {
  const participantId = req.nextUrl.searchParams.get("participantId");
  const db = supabaseAdmin();
  const { data: campaign } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ rewards: [] });

  const { data: cards } = await db.from("rewards")
    .select("*").eq("campaign_id", campaign.id).eq("active", true)
    .order("created_at", { ascending: true });

  // target spots per card (names, for display)
  const cardIds = (cards || []).map((c: any) => c.id);
  const targetsByCard: Record<string, any[]> = {};
  if (cardIds.length) {
    const { data: cs } = await db.from("card_spots")
      .select("reward_id, spot:spots(id, name_ja, name_en)").in("reward_id", cardIds);
    for (const row of cs || []) {
      (targetsByCard[row.reward_id] ||= []).push(row.spot);
    }
  }

  if (!participantId || !(cards || []).length) {
    return NextResponse.json({ rewards: (cards || []).map((c: any) => ({ ...c, progress: 0, unlocked: false, stamps: [], completions: 0, target_spots: targetsByCard[c.id] || [] })) });
  }

  // completions per card (= current cycle)
  const { data: states } = await db.from("card_state")
    .select("reward_id, completions").eq("participant_id", participantId);
  const cycleOf: Record<string, number> = {};
  for (const s of states || []) cycleOf[s.reward_id] = s.completions;

  // all of this participant's stamps (we filter by card+cycle in JS)
  const { data: stamps } = await db.from("stamps")
    .select("reward_id, cycle, spot_name_ja, spot_name_en, spot_image_url, acquired_at")
    .eq("participant_id", participantId)
    .order("acquired_at", { ascending: true });

  const out = (cards || []).map((c: any) => {
    const cycle = cycleOf[c.id] ?? 0;
    const mine = (stamps || []).filter((s: any) => s.reward_id === c.id && s.cycle === cycle);
    return {
      ...c,
      completions: cycle,
      progress: mine.length,
      unlocked: mine.length >= c.required_stamps,
      stamps: mine,
      target_spots: targetsByCard[c.id] || [],
    };
  });
  return NextResponse.json({ rewards: out });
}

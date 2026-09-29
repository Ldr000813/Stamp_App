import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function plusTwoMonths(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return d.toISOString();
}

// Record a stamp for a specific stamp card (reward). Any active spot counts once
// per card per cycle. On completion, grant that card's coupons (2-month expiry);
// recurring cards then reset to a fresh cycle.
export async function POST(req: NextRequest) {
  const { participantId, spotToken, rewardId } = await req.json().catch(() => ({}));
  if (!participantId || !spotToken || !rewardId)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const db = supabaseAdmin();

  const { data: spot } = await db.from("spots")
    .select("id, active, name_ja, name_en, image_url").eq("token", spotToken).maybeSingle();
  if (!spot || !spot.active) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });

  const { data: card } = await db.from("rewards")
    .select("id, active, required_stamps, recurring, campaign_id").eq("id", rewardId).maybeSingle();
  if (!card || !card.active) return NextResponse.json({ error: "card_not_found" }, { status: 404 });

  // The spot must be one of this card's target spots.
  const { data: target } = await db.from("card_spots")
    .select("spot_id").eq("reward_id", card.id).eq("spot_id", spot.id).maybeSingle();
  if (!target) return NextResponse.json({ not_target: true });

  // current cycle = number of completions so far
  const { data: state } = await db.from("card_state")
    .select("completions").eq("participant_id", participantId).eq("reward_id", card.id).maybeSingle();
  const cycle = state?.completions ?? 0;

  const countIn = async () => {
    const { count } = await db.from("stamps").select("*", { count: "exact", head: true })
      .eq("participant_id", participantId).eq("reward_id", card.id).eq("cycle", cycle);
    return count || 0;
  };

  const before = await countIn();
  // Non-recurring card already finished → nothing to do.
  if (!card.recurring && before >= card.required_stamps) {
    return NextResponse.json({ already_complete: true, done: before, total: card.required_stamps });
  }

  // JST calendar date, so "one per spot per day" matches Japan's day boundary.
  const stampDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { error: insErr } = await db.from("stamps").insert({
    participant_id: participantId, reward_id: card.id, campaign_id: card.campaign_id,
    spot_id: spot.id, cycle, stamp_date: stampDate,
    spot_name_ja: spot.name_ja, spot_name_en: spot.name_en, spot_image_url: spot.image_url,
  });
  const already = !!insErr && (insErr as any).code === "23505"; // this spot already on this card/cycle
  if (insErr && !already) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const done = already ? before : before + 1;
  const completed = !already && done >= card.required_stamps;

  let granted: any[] = [];
  if (completed) {
    const { data: links } = await db.from("card_coupons")
      .select("coupon:coupons(id, title_ja, title_en, active)").eq("reward_id", card.id);
    const coupons = (links || []).map((l: any) => l.coupon).filter((c: any) => c && c.active);
    const expires_at = plusTwoMonths();
    for (const c of coupons || []) {
      // Non-recurring: grant once. Recurring: grant every completion.
      if (!card.recurring) {
        const { data: exists } = await db.from("coupon_grants")
          .select("id").eq("coupon_id", c.id).eq("participant_id", participantId).limit(1).maybeSingle();
        if (exists) continue;
      }
      await db.from("coupon_grants").insert({ coupon_id: c.id, participant_id: participantId, expires_at });
      granted.push({ title_ja: c.title_ja, title_en: c.title_en, expires_at });
    }
    // Recurring: bump completions so the card resets to a fresh cycle.
    if (card.recurring) {
      await db.from("card_state").upsert(
        { participant_id: participantId, reward_id: card.id, completions: cycle + 1 },
        { onConflict: "participant_id,reward_id" }
      );
    }
  }

  return NextResponse.json({
    already, done, total: card.required_stamps,
    completed, recurring: card.recurring, granted,
  });
}

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
  // Defend against a misconfigured card (required 0 or negative would grant on
  // every scan / never complete). Treat the threshold as at least 1.
  const required = Math.max(1, Number(card.required_stamps) || 1);

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
  if (!card.recurring && before >= required) {
    return NextResponse.json({ already_complete: true, done: before, total: required });
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

  // Count AUTHORITATIVELY after the insert. Reading "before + 1" is racy: two
  // simultaneous scans that complete a card both read before=0 and each think
  // they are only the 1st stamp, so completion (and the coupon) gets missed.
  const done = already ? before : await countIn();
  const completed = !already && done >= required;

  let granted: any[] = [];
  if (completed) {
    const { data: links } = await db.from("card_coupons")
      .select("coupon:coupons(id, title_ja, title_en, active)").eq("reward_id", card.id);
    const coupons = (links || []).map((l: any) => l.coupon).filter((c: any) => c && c.active);
    const expires_at = plusTwoMonths();
    for (const c of coupons || []) {
      // Grant is keyed to (participant, card, coupon, cycle) with a UNIQUE index,
      // so concurrent completions collapse to exactly ONE grant (no miss, no dup).
      const { data: ins, error: gErr } = await db.from("coupon_grants")
        .insert({ coupon_id: c.id, participant_id: participantId, reward_id: card.id, cycle, expires_at })
        .select("id");
      if (!gErr && ins && ins.length) granted.push({ title_ja: c.title_ja, title_en: c.title_en, expires_at });
      // gErr 23505 = another concurrent request already granted this cycle → skip silently.
    }
    // Recurring: advance the completion counter exactly once (conditional on the
    // current cycle) so the card resets without double-advancing under a race.
    if (card.recurring) {
      const { data: adv } = await db.from("card_state")
        .update({ completions: cycle + 1 })
        .eq("participant_id", participantId).eq("reward_id", card.id).eq("completions", cycle)
        .select("participant_id");
      if (!adv || adv.length === 0) {
        // No row at this cycle yet (first completion) → create it; PK collision under
        // a race means someone else already advanced, which is fine to ignore.
        await db.from("card_state").insert({ participant_id: participantId, reward_id: card.id, completions: cycle + 1 });
      }
    }
  }

  return NextResponse.json({
    already, done, total: required,
    completed, recurring: card.recurring, granted,
  });
}

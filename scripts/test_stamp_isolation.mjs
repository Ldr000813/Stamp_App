// Integration test: stamps are recorded per-participant with no cross-mixing,
// and the per-spot/per-day dedup works. Uses two throwaway participant UUIDs and
// deletes all of their test rows at the end. Run from the app root.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// --- load env from .env.local ---
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const API = process.env.API_BASE || "https://stamp-app-two.vercel.app";
const db = createClient(URL, SR, { auth: { persistSession: false } });

const A = randomUUID();
const B = randomUUID();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✅", m); } else { fail++; console.log("  ❌", m); } };

async function stamp(participantId, spotToken, rewardId) {
  const r = await fetch(`${API}/api/stamp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, spotToken, rewardId }),
  });
  return r.json();
}
async function countIn(pid, rewardId, cycle) {
  const { count } = await db.from("stamps").select("*", { count: "exact", head: true })
    .eq("participant_id", pid).eq("reward_id", rewardId).eq("cycle", cycle);
  return count || 0;
}
async function cleanup() {
  for (const pid of [A, B]) {
    await db.from("stamps").delete().eq("participant_id", pid);
    await db.from("card_state").delete().eq("participant_id", pid);
    await db.from("coupon_grants").delete().eq("participant_id", pid);
  }
}

async function main() {
  console.log("API base:", API);
  // pick an active campaign, an active card, and its target spots (with tokens)
  const { data: camp } = await db.from("campaigns").select("id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!camp) throw new Error("no active campaign");
  const { data: cards } = await db.from("rewards").select("id, title_ja, required_stamps, recurring")
    .eq("campaign_id", camp.id).eq("active", true).order("created_at");
  if (!cards?.length) throw new Error("no active cards");

  // find a card that has at least one target spot with a token
  let card = null, spots = [];
  for (const c of cards) {
    const { data: cs } = await db.from("card_spots")
      .select("spot:spots(id, token, name_ja, active)").eq("reward_id", c.id);
    const usable = (cs || []).map((x) => x.spot).filter((s) => s && s.token && s.active);
    if (usable.length) { card = c; spots = usable; break; }
  }
  if (!card) throw new Error("no card with a tokened, active target spot");
  console.log(`\nCard: ${card.title_ja} (need ${card.required_stamps}, recurring=${card.recurring})`);
  console.log(`Target spots available: ${spots.length}`);
  const cycle = 0; // fresh test participants start at cycle 0

  await cleanup(); // ensure clean slate

  console.log(`\nParticipant A=${A.slice(0, 8)}  B=${B.slice(0, 8)}`);

  console.log("\n[1] A stamps spot#1");
  const r1 = await stamp(A, spots[0].token, card.id);
  ok(!r1.error && !r1.not_target, `A got a response without error (${JSON.stringify(r1)})`);
  ok((await countIn(A, card.id, cycle)) === 1, "A now has exactly 1 stamp in DB");
  ok((await countIn(B, card.id, cycle)) === 0, "B still has 0 (A's stamp did NOT leak to B)");

  console.log("\n[2] B stamps the SAME spot#1");
  const r2 = await stamp(B, spots[0].token, card.id);
  ok(!r2.error && !r2.not_target, `B got a response without error (${JSON.stringify(r2)})`);
  ok((await countIn(B, card.id, cycle)) === 1, "B now has exactly 1 stamp");
  ok((await countIn(A, card.id, cycle)) === 1, "A is still 1 (B did not change A)");

  console.log("\n[3] A stamps spot#1 AGAIN (same day → dedup)");
  const r3 = await stamp(A, spots[0].token, card.id);
  ok(r3.already === true, `A's duplicate is rejected as already (${JSON.stringify(r3)})`);
  ok((await countIn(A, card.id, cycle)) === 1, "A is still 1 after duplicate (no double count)");

  if (spots.length > 1) {
    console.log("\n[4] A stamps a DIFFERENT spot#2");
    const r4 = await stamp(A, spots[1].token, card.id);
    ok(!r4.error && !r4.not_target, `A stamped spot#2 (${JSON.stringify(r4)})`);
    ok((await countIn(A, card.id, cycle)) === 2, "A now has 2 stamps");
    ok((await countIn(B, card.id, cycle)) === 1, "B is still 1 (unaffected)");
  } else {
    console.log("\n[4] skipped (card has only one target spot)");
  }

  console.log("\nCleaning up test data…");
  await cleanup();
  const a0 = await countIn(A, card.id, cycle), b0 = await countIn(B, card.id, cycle);
  ok(a0 === 0 && b0 === 0, "test stamps removed (A=0, B=0)");

  console.log(`\n===== ${fail === 0 ? "ALL PASS" : "SOME FAILED"} : ${pass} passed, ${fail} failed =====`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error("ERROR:", e.message); await cleanup(); process.exit(2); });

#!/usr/bin/env node
/**
 * 最終チェック — 機能⑩「カオス第2弾（もっとハード・レアケース）」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_chaos2.mjs   (または npm run test:chaos2)
 *
 * G 高並列の完了レース（required=5 を5枚同時）
 * H 定期カードの完了レース／連続多サイクル（付与とcompletionsが1回ずつ）
 * I 共有スポット・共有クーポンのレア構成（カードごとに独立して付与）
 * J 超高並列の重複（50並列でも1個）
 * K レア／設計上の注意（定期カードの同日再スキャンで荒稼ぎできるか）＝情報表示
 * L 完了直後の即クーポン使用（実フロー）
 *
 * 安全性: 非アクティブ隔離キャンペーン＋使い捨てUUID＋ZZTEST_。最後に全削除。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && l.includes("=")).map((l) => {
      const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const API = (process.env.API_BASE || "https://stamp-app-two.vercel.app").replace(/\/$/, "");
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error("Missing Supabase env in .env.local"); process.exit(2); }
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
let passed = 0, failed = 0; const failures = [];
class AssertError extends Error {}
function assert(c, m) { if (!c) throw new AssertError(m); }
function eq(a, b, m) { assert(JSON.stringify(a) === JSON.stringify(b), `${m} — 期待:${JSON.stringify(b)} 実際:${JSON.stringify(a)}`); }
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ${C.g}✅ PASS${C.x}  ${name}`); }
  catch (e) { failed++; failures.push({ name, msg: e.message });
    console.log(`  ${C.r}❌ ${e instanceof AssertError ? "FAIL" : "ERROR"}${C.x}  ${name}\n        ${C.r}${e.message}${C.x}`); }
}
function group(t) { console.log(`\n${C.b}${t}${C.x}`); }

const PREFIX = "ZZTEST_";
const participants = new Set();
function newP() { const id = randomUUID(); participants.add(id); return id; }

async function stamp(pid, spotToken, rewardId) {
  const res = await fetch(`${API}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: pid, spotToken, rewardId }) });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function redeem(pid, grantId) {
  const res = await fetch(`${API}/api/coupons/redeem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: pid, grantId }) });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function cycleCount(pid, rewardId, cycle = 0) {
  const { count } = await db.from("stamps").select("*", { count: "exact", head: true }).eq("participant_id", pid).eq("reward_id", rewardId).eq("cycle", cycle);
  return count || 0;
}
async function grantsCount(pid, couponId) {
  const { count } = await db.from("coupon_grants").select("*", { count: "exact", head: true }).eq("participant_id", pid).eq("coupon_id", couponId);
  return count || 0;
}
async function completions(pid, rewardId) {
  const { data } = await db.from("card_state").select("completions").eq("participant_id", pid).eq("reward_id", rewardId).maybeSingle();
  return data?.completions ?? 0;
}

const fx = { campaignId: null, spots: {}, cards: {}, coupons: {} };
async function makeSpot(key) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null; row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id, token").single();
  if (error) throw new Error("makeSpot: " + error.message);
  fx.spots[key] = data;
}
async function makeCoupon(key) {
  const { data, error } = await db.from("coupons").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, active: true }).select("id").single();
  if (error) throw new Error("makeCoupon: " + error.message);
  fx.coupons[key] = data.id;
}
async function makeCard(key, { required, recurring = false, spotKeys, couponKey }) {
  const { data, error } = await db.from("rewards").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, required_stamps: required, recurring, active: true }).select("id").single();
  if (error) throw new Error("makeCard: " + error.message);
  fx.cards[key] = data.id;
  for (const sk of spotKeys) await db.from("card_spots").insert({ reward_id: data.id, spot_id: fx.spots[sk].id });
  if (couponKey) await db.from("card_coupons").insert({ reward_id: data.id, coupon_id: fx.coupons[couponKey] });
}
async function setup() {
  const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
  const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
  if ("name" in camp) camp.name = PREFIX + "chaos2"; if ("title_ja" in camp) camp.title_ja = PREFIX + "chaos2";
  const { data: c, error } = await db.from("campaigns").insert(camp).select("id").single();
  if (error) throw new Error("setup campaign: " + error.message);
  fx.campaignId = c.id;
  for (const k of ["s0", "s1", "s2", "s3", "s4", "s5"]) await makeSpot(k);
  for (const k of ["cpnA", "cpnB", "cpnC", "cpnD", "cpnE", "cpnShared"]) await makeCoupon(k);
  await makeCard("big5", { required: 5, spotKeys: ["s0", "s1", "s2", "s3", "s4"], couponKey: "cpnA" });
  await makeCard("rec2", { required: 2, recurring: true, spotKeys: ["s0", "s1", "s2", "s3", "s4"], couponKey: "cpnB" });
  await makeCard("rec1", { required: 1, recurring: true, spotKeys: ["s0"], couponKey: "cpnC" });
  await makeCard("cardX", { required: 1, spotKeys: ["s5"], couponKey: "cpnD" }); // 共有スポット s5
  await makeCard("cardY", { required: 1, spotKeys: ["s5"], couponKey: "cpnE" });
  await makeCard("cardP", { required: 1, spotKeys: ["s0"], couponKey: "cpnShared" }); // 共有クーポン
  await makeCard("cardQ", { required: 1, spotKeys: ["s1"], couponKey: "cpnShared" });
}
async function teardown() {
  try {
    const pids = [...participants];
    if (pids.length) {
      await db.from("coupon_grants").delete().in("participant_id", pids);
      await db.from("stamps").delete().in("participant_id", pids);
      await db.from("card_state").delete().in("participant_id", pids);
    }
    await db.from("rewards").delete().like("title_ja", PREFIX + "%");
    await db.from("coupons").delete().like("title_ja", PREFIX + "%");
    await db.from("spots").delete().like("name_ja", PREFIX + "%");
    if (fx.campaignId) await db.from("campaigns").delete().eq("id", fx.campaignId);
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function run() {
  const T = (k) => fx.spots[k].token;
  const R = (k) => fx.cards[k];

  group("G. 高並列の完了レース（required=5 を同時に満たす）");
  await test("G1 5つの別スポットを完全同時×8回 → 毎回クーポン1枚（取りこぼしなし）", async () => {
    for (let i = 0; i < 8; i++) {
      const p = newP();
      await Promise.all(["s0", "s1", "s2", "s3", "s4"].map((s) => stamp(p, T(s), R("big5"))));
      const cnt = await cycleCount(p, R("big5"));
      const gr = await grantsCount(p, fx.coupons.cpnA);
      assert(cnt === 5 && gr === 1, `#${i}: stamps=${cnt}, grants=${gr}（期待 5/1）`);
    }
  });
  await test("G2 5枚+重複3枚を同時（計8並列）→ stamps=5, grants=1", async () => {
    const p = newP();
    const spots = ["s0", "s1", "s2", "s3", "s4", "s0", "s2", "s4"];
    await Promise.all(spots.map((s) => stamp(p, T(s), R("big5"))));
    eq(await cycleCount(p, R("big5")), 5, "stamps");
    eq(await grantsCount(p, fx.coupons.cpnA), 1, "grants");
  });

  group("H. 定期カードの完了レース／連続多サイクル");
  await test("H1 定期required=2 を2枚同時で完了×6回 → 各回 付与1・completions+1（二重前進なし）", async () => {
    for (let i = 0; i < 6; i++) {
      const p = newP();
      await Promise.all([stamp(p, T("s0"), R("rec2")), stamp(p, T("s1"), R("rec2"))]);
      const gr = await grantsCount(p, fx.coupons.cpnB);
      const comp = await completions(p, R("rec2"));
      assert(gr === 1 && comp === 1, `#${i}: grants=${gr}, completions=${comp}（期待 1/1）`);
    }
  });
  await test("H2 定期を同日2サイクル完了（別スポット対 s0,s1 → s2,s3）→ completions=2, grants=2", async () => {
    const p = newP();
    await stamp(p, T("s0"), R("rec2")); await stamp(p, T("s1"), R("rec2")); // cycle0 完了
    await stamp(p, T("s2"), R("rec2")); await stamp(p, T("s3"), R("rec2")); // cycle1 完了（新スポット）
    eq(await completions(p, R("rec2")), 2, "completions");
    eq(await grantsCount(p, fx.coupons.cpnB), 2, "grants");
  });

  group("I. 共有スポット・共有クーポン（レア構成でも独立して正しい）");
  await test("I1 同じスポット(s5)が2枚のカードの対象 → 双方が独立して完了・付与", async () => {
    const p = newP();
    await stamp(p, T("s5"), R("cardX"));
    await stamp(p, T("s5"), R("cardY"));
    eq(await grantsCount(p, fx.coupons.cpnD), 1, "cardX のクーポン");
    eq(await grantsCount(p, fx.coupons.cpnE), 1, "cardY のクーポン");
  });
  await test("I2 同じクーポンが2枚のカードに紐づく → カードごとに1枚ずつ付与(計2)", async () => {
    const p = newP();
    await stamp(p, T("s0"), R("cardP"));
    await stamp(p, T("s1"), R("cardQ"));
    eq(await grantsCount(p, fx.coupons.cpnShared), 2, "共有クーポンはカードごとに付与");
  });

  group("J. 超高並列の重複");
  await test("J1 同一スポットを50並列 → 1個だけ", async () => {
    const p = newP();
    await Promise.all(Array.from({ length: 50 }, () => stamp(p, T("s0"), R("big5"))));
    eq(await cycleCount(p, R("big5")), 1, "count");
  });

  group("L. 完了直後の即クーポン使用（実フロー）");
  await test("L1 完了→付与されたクーポンをその場で使用できる", async () => {
    const p = newP();
    for (const s of ["s0", "s1", "s2", "s3", "s4"]) await stamp(p, T(s), R("big5"));
    const { data: g } = await db.from("coupon_grants").select("id").eq("participant_id", p).eq("coupon_id", fx.coupons.cpnA).limit(1).single();
    const r = await redeem(p, g.id);
    eq(r.ok, true, "使用OK");
  });

  // ---- K. レア／設計上の注意（合否に含めない情報表示）----
  group("K. レア／設計上の注意（定期カードの同日再スキャン）");
  const p1 = newP();
  await stamp(p1, T("s0"), R("rec1")); await stamp(p1, T("s0"), R("rec1")); await stamp(p1, T("s0"), R("rec1"));
  const g1 = await grantsCount(p1, fx.coupons.cpnC);
  const p2 = newP();
  await stamp(p2, T("s0"), R("rec2")); await stamp(p2, T("s1"), R("rec2"));
  await stamp(p2, T("s0"), R("rec2")); await stamp(p2, T("s1"), R("rec2"));
  const g2 = await grantsCount(p2, fx.coupons.cpnB);
  if (g1 > 1 || g2 > 1) {
    console.log(`  ${C.y}ℹ 情報${C.x}  ${C.y}定期カードは「同じ日に同じQRを再スキャン」でもサイクルが進み、クーポンを増やせます`);
    console.log(`         （required=1定期: 同一スポット3回で ${g1}枚 / required=2定期: 同一2スポット2周で ${g2}枚）。`);
    console.log(`         仕様として意図通りなら問題なし。現場での荒稼ぎを防ぐなら「定期でも同一スポットは同日1回まで」`);
    console.log(`         等のクールダウンを追加できます。${C.x}`);
  } else {
    console.log(`  ${C.c}ℹ 情報${C.x}  定期カードの同日再スキャンではクーポンは増えませんでした（g1=${g1}, g2=${g2}）。`);
  }
}

(async () => {
  console.log(`${C.b}最終チェック: カオス第2弾（ハード＆レアケース）${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}隔離フィクスチャを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

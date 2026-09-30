#!/usr/bin/env node
/**
 * 最終チェック — 機能⑨「カオス／ストレステスト（わざと壊しにいく）」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_chaos.mjs      (または npm run test:chaos)
 *        ローカル:  API_BASE=http://localhost:3000 node scripts/test_chaos.mjs
 *
 * 実ユーザーのラフな操作と競合を想定して極限を突く:
 *   A 連打（同一QR何度も）  B 異なるQRの同時スキャン
 *   C 完了の瞬間の同時スキャン（クーポン取りこぼし競合）★核心
 *   D 不正・悪意入力でのクラッシュ耐性   E 多人数の同時アクセス混在
 *   F クーポンの乱打（二重使用）
 *
 * 注意: C はレース条件を突くため、環境によっては FAIL することがあります。
 *       それは「バグを検出した」という価値ある結果です（対処法は結果に応じて提案）。
 *
 * 安全性: 非アクティブ隔離キャンペーン＋使い捨てUUID＋ZZTEST_フィクスチャ。最後に全削除。
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

async function stampRaw(bodyObj) {
  const res = await fetch(`${API}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj) });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
const stamp = (pid, spotToken, rewardId) => stampRaw({ participantId: pid, spotToken, rewardId });
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

const fx = { campaignId: null, spots: {}, cards: {}, coupons: {} };
async function makeSpot(key, { active = true } = {}) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = active; row.owner_email = null; row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id, token").single();
  if (error) throw new Error("makeSpot: " + error.message);
  fx.spots[key] = data; return data;
}
async function makeCoupon(key) {
  const { data, error } = await db.from("coupons").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, active: true }).select("id").single();
  if (error) throw new Error("makeCoupon: " + error.message);
  fx.coupons[key] = data.id; return data.id;
}
async function makeCard(key, { required, recurring = false, spotKeys, couponKey }) {
  const { data, error } = await db.from("rewards").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, required_stamps: required, recurring, active: true }).select("id").single();
  if (error) throw new Error("makeCard: " + error.message);
  fx.cards[key] = data.id;
  for (const sk of spotKeys) await db.from("card_spots").insert({ reward_id: data.id, spot_id: fx.spots[sk].id });
  if (couponKey) await db.from("card_coupons").insert({ reward_id: data.id, coupon_id: fx.coupons[couponKey] });
  return data.id;
}
async function setup() {
  const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
  const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
  if ("name" in camp) camp.name = PREFIX + "chaos"; if ("title_ja" in camp) camp.title_ja = PREFIX + "chaos";
  const { data: c, error } = await db.from("campaigns").insert(camp).select("id").single();
  if (error) throw new Error("setup campaign: " + error.message);
  fx.campaignId = c.id;
  for (const k of ["s0", "s1", "s2", "s3", "s4"]) await makeSpot(k);
  await makeSpot("sInactive", { active: false });
  await makeCoupon("cpnA"); await makeCoupon("cpnB");
  await makeCard("race", { required: 2, spotKeys: ["s0", "s1", "s2", "s3", "s4"], couponKey: "cpnA" }); // 完了レース用
  await makeCard("big", { required: 5, spotKeys: ["s0", "s1", "s2", "s3", "s4"], couponKey: "cpnB" });   // 高しきい値
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

  group("A. 連打（せっかちユーザーが同じQRを何度もタップ）");
  await test("A1 同一スポットを12並列 → DBには1個だけ", async () => {
    const p = newP();
    await Promise.all(Array.from({ length: 12 }, () => stamp(p, T("s0"), R("big"))));
    eq(await cycleCount(p, R("big")), 1, "count");
  });
  await test("A2 続けて同日に5回連打 → まだ1個", async () => {
    const p = newP();
    await stamp(p, T("s0"), R("big"));
    for (let i = 0; i < 5; i++) await stamp(p, T("s0"), R("big"));
    eq(await cycleCount(p, R("big")), 1, "count");
  });

  group("B. 異なるQRの同時スキャン");
  await test("B1 3つの異なる対象スポットを同時 → 3個すべて記録", async () => {
    const p = newP();
    await Promise.all([stamp(p, T("s0"), R("big")), stamp(p, T("s1"), R("big")), stamp(p, T("s2"), R("big"))]);
    eq(await cycleCount(p, R("big")), 3, "count");
  });

  group("C. ★完了の瞬間の同時スキャン（クーポン取りこぼし競合を検出）");
  await test("C1 required=2 を2つの別スポット同時で満たす×10回 → 毎回クーポンが1枚付与される", async () => {
    const K = 10; let misses = 0; const detail = [];
    for (let i = 0; i < K; i++) {
      const p = newP();
      await Promise.all([stamp(p, T("s0"), R("race")), stamp(p, T("s1"), R("race"))]);
      const cnt = await cycleCount(p, R("race"));
      const gr = await grantsCount(p, fx.coupons.cpnA);
      if (cnt >= 2 && gr < 1) { misses++; detail.push(`#${i}: stamps=${cnt} だが grants=${gr}`); }
    }
    assert(misses === 0, `完了レースでクーポン取りこぼし ${misses}/${K} 回:\n        ${detail.join("\n        ")}`);
  });
  await test("C2 完了後に別スポットを連打してもクーポンは増えない（多重付与なし）", async () => {
    const p = newP();
    await stamp(p, T("s0"), R("race")); await stamp(p, T("s1"), R("race")); // 完了
    await Promise.all([stamp(p, T("s2"), R("race")), stamp(p, T("s3"), R("race")), stamp(p, T("s4"), R("race"))]);
    const gr = await grantsCount(p, fx.coupons.cpnA);
    assert(gr <= 1, `クーポンが多重付与された: grants=${gr}`);
  });

  group("D. 不正・悪意入力でのクラッシュ耐性（安全に弾く・DBは無傷）");
  await test("D1 participantId にSQL的な文字列 → 2xxにならない、注入は実行されない", async () => {
    const r = await stamp("'; DROP TABLE stamps;--", T("s0"), R("big"));
    assert(r.status >= 400, `2xxで受理された status=${r.status}`);
    // stamps テーブルが生きているか（フィクスチャのカードが引ける）で健全性確認
    const { error } = await db.from("stamps").select("id", { head: true, count: "exact" }).eq("reward_id", R("big"));
    assert(!error, "stamps テーブルが壊れている: " + (error?.message || ""));
  });
  await test("D2 rewardId が不正なUUID → 400/404 で弾く", async () => {
    const p = newP();
    const r = await stamp(p, T("s0"), "not-a-uuid");
    assert(r.status >= 400, `status=${r.status}`);
    eq(await cycleCount(p, R("big")), 0, "何も挿入されない");
  });
  await test("D3 spotToken が超長文字列 → 404 spot_not_found", async () => {
    const p = newP();
    const r = await stamp(p, "x".repeat(100000), R("big"));
    assert(r.status >= 400, `status=${r.status}`);
  });
  await test("D4 型違い（participantId が数値, JSONそのまま） → クラッシュせず弾く", async () => {
    const r = await stampRaw({ participantId: 1234567, spotToken: T("s0"), rewardId: R("big") });
    assert(r.status >= 400, `status=${r.status}`);
  });
  await test("D5 未知の余計なフィールドがあっても正常なスタンプは成功する", async () => {
    const p = newP();
    const r = await stampRaw({ participantId: p, spotToken: T("s0"), rewardId: R("big"), evil: { a: 1 }, note: "x".repeat(500) });
    assert(!r.error, `正常入力が拒否された: ${JSON.stringify(r)}`);
    eq(await cycleCount(p, R("big")), 1, "1個記録");
  });

  group("E. 多人数の同時アクセス混在（分離が保たれる）");
  await test("E1 5人が同じスポットを各3並列 → 各自ちょうど1個、混ざらない", async () => {
    const ps = Array.from({ length: 5 }, () => newP());
    await Promise.all(ps.flatMap((p) => [stamp(p, T("s0"), R("big")), stamp(p, T("s0"), R("big")), stamp(p, T("s0"), R("big"))]));
    for (const p of ps) eq(await cycleCount(p, R("big")), 1, `参加者 ${p.slice(0, 6)} は1個`);
  });

  group("F. クーポンの乱打（二重使用しても状態が壊れない）");
  await test("F1 付与を10並列で使用 → 最終的に使用済みで確定", async () => {
    const p = newP(); participants.add(p);
    const { data: g } = await db.from("coupon_grants").insert({ coupon_id: fx.coupons.cpnA, participant_id: p, expires_at: new Date(Date.now() + 60 * 86400e3).toISOString() }).select("id").single();
    await Promise.all(Array.from({ length: 10 }, () => redeem(p, g.id)));
    const { data: after } = await db.from("coupon_grants").select("redeemed_at").eq("id", g.id).single();
    assert(!!after.redeemed_at, "使用済みで確定していない");
  });
}

(async () => {
  console.log(`${C.b}最終チェック: カオス／ストレステスト${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}隔離フィクスチャを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

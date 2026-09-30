#!/usr/bin/env node
/**
 * 最終チェック — 機能①「スタンプ付与ロジック」の企業レベル網羅テスト
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_stamps.mjs
 *        (本番APIに対して実行。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 安全性:
 *  - テスト専用の「非アクティブ」キャンペーン上に隔離フィクスチャを作成するため、
 *    本番の参加者画面には一切表示されません（/api/rewards は active campaign のみ表示）。
 *  - 使い捨てUUIDの参加者だけを使い、最後に作成物を全削除します（try/finally）。
 *  - 既存の実データ（本番のスタンプ等）には一切触れません。
 *
 * 対象: POST /api/stamp のあらゆる分岐と不変条件
 *  A 入力検証 / B 状態ゲート / C 挿入・ユーザー分離 / D 完走・クーポン付与
 *  E 定期カードのサイクルリセット / F 日付境界 / G 同時実行の競合 / H データ保全
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ---- env ----
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

// ---- tiny test harness ----
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
let passed = 0, failed = 0; const failures = [];
class AssertError extends Error {}
function assert(cond, msg) { if (!cond) throw new AssertError(msg); }
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — 期待:${JSON.stringify(b)} 実際:${JSON.stringify(a)}`); }
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ${C.g}✅ PASS${C.x}  ${name}`); }
  catch (e) {
    failed++; failures.push({ name, msg: e.message });
    const tag = e instanceof AssertError ? "FAIL" : "ERROR";
    console.log(`  ${C.r}❌ ${tag}${C.x}  ${name}\n        ${C.r}${e.message}${C.x}`);
  }
}
function group(t) { console.log(`\n${C.b}${t}${C.x}`); }

// ---- API + DB helpers ----
const PREFIX = "ZZTEST_";
const participants = new Set();
function newParticipant() { const id = randomUUID(); participants.add(id); return id; }

async function stamp(participantId, spotToken, rewardId, { raw } = {}) {
  const body = raw !== undefined ? raw : JSON.stringify({ participantId, spotToken, rewardId });
  const res = await fetch(`${API}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, ...(json || {}) };
}
async function cycleCount(pid, rewardId, cycle) {
  const { count } = await db.from("stamps").select("*", { count: "exact", head: true })
    .eq("participant_id", pid).eq("reward_id", rewardId).eq("cycle", cycle);
  return count || 0;
}
async function grantsCount(pid, couponId) {
  const { count } = await db.from("coupon_grants").select("*", { count: "exact", head: true })
    .eq("participant_id", pid).eq("coupon_id", couponId);
  return count || 0;
}
async function completions(pid, rewardId) {
  const { data } = await db.from("card_state").select("completions").eq("participant_id", pid).eq("reward_id", rewardId).maybeSingle();
  return data?.completions ?? 0;
}

// ---- fixtures ----
const fx = { campaignId: null, spots: {}, cards: {}, coupons: {} };

async function makeSpot(key, { active = true } = {}) {
  // Clone a real spot row to satisfy any NOT NULL columns, then override.
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src };
  delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key;
  row.token = randomUUID();          // explicit, known token (works for uuid/text)
  row.active = active; row.owner_email = null;
  row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id, token").single();
  if (error) throw new Error("makeSpot failed: " + error.message);
  fx.spots[key] = data; return data;
}
async function makeCard(key, { required, recurring, active = true, spotKeys = [], couponKey = null }) {
  const { data, error } = await db.from("rewards").insert({
    campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key,
    required_stamps: required, recurring, active,
  }).select("id").single();
  if (error) throw new Error("makeCard failed: " + error.message);
  fx.cards[key] = data.id;
  for (const sk of spotKeys) await db.from("card_spots").insert({ reward_id: data.id, spot_id: fx.spots[sk].id });
  if (couponKey) await db.from("card_coupons").insert({ reward_id: data.id, coupon_id: fx.coupons[couponKey] });
  return data.id;
}
async function makeCoupon(key) {
  const { data, error } = await db.from("coupons").insert({
    campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, active: true,
  }).select("id").single();
  if (error) throw new Error("makeCoupon failed: " + error.message);
  fx.coupons[key] = data.id; return data.id;
}

async function setup() {
  // Isolated INACTIVE campaign (cloned so any NOT NULL columns are satisfied).
  const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
  const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
  if ("name" in camp) camp.name = PREFIX + "campaign";
  if ("title_ja" in camp) camp.title_ja = PREFIX + "campaign";
  const { data: c, error } = await db.from("campaigns").insert(camp).select("id").single();
  if (error) throw new Error("setup campaign failed: " + error.message);
  fx.campaignId = c.id;

  await makeSpot("spot1"); await makeSpot("spot2"); await makeSpot("spot3");
  await makeSpot("spotInactive", { active: false });
  await makeCoupon("cpnX"); await makeCoupon("cpnY");
  // non-recurring, need 2, targets spot1+spot2, grants cpnX (spot3 is NON-target)
  await makeCard("nonRec", { required: 2, recurring: false, spotKeys: ["spot1", "spot2"], couponKey: "cpnX" });
  // recurring, need 2, targets spot1+spot2, grants cpnY
  await makeCard("rec", { required: 2, recurring: true, spotKeys: ["spot1", "spot2"], couponKey: "cpnY" });
  // inactive card (targets spot1)
  await makeCard("inactive", { required: 2, recurring: false, active: false, spotKeys: ["spot1"] });
}

async function teardown() {
  try {
    const pids = [...participants];
    if (pids.length) {
      await db.from("coupon_grants").delete().in("participant_id", pids);
      await db.from("stamps").delete().in("participant_id", pids);
      await db.from("card_state").delete().in("participant_id", pids);
    }
    // Delete by prefix — cascades handle card_spots/card_coupons/stamps via FKs.
    await db.from("rewards").delete().like("title_ja", PREFIX + "%");
    await db.from("coupons").delete().like("title_ja", PREFIX + "%");
    await db.from("spots").delete().like("name_ja", PREFIX + "%");
    if (fx.campaignId) await db.from("campaigns").delete().eq("id", fx.campaignId);
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

// ============================ TEST SCENARIOS ============================
async function run() {
  const T = (k) => fx.spots[k].token;      // spot token
  const R = (k) => fx.cards[k];            // reward/card id

  group("A. 入力検証（不正リクエスト）");
  await test("A1 participantId 欠落 → 400", async () => {
    const r = await stamp(null, T("spot1"), R("nonRec"), { raw: JSON.stringify({ spotToken: T("spot1"), rewardId: R("nonRec") }) });
    eq(r.status, 400, "status");
  });
  await test("A2 spotToken 欠落 → 400", async () => {
    const p = newParticipant();
    const r = await stamp(p, null, R("nonRec"), { raw: JSON.stringify({ participantId: p, rewardId: R("nonRec") }) });
    eq(r.status, 400, "status");
  });
  await test("A3 rewardId 欠落 → 400", async () => {
    const p = newParticipant();
    const r = await stamp(p, T("spot1"), null, { raw: JSON.stringify({ participantId: p, spotToken: T("spot1") }) });
    eq(r.status, 400, "status");
  });
  await test("A4 壊れたJSONボディ → 400", async () => {
    const r = await stamp(null, null, null, { raw: "{ this is not json" });
    eq(r.status, 400, "status");
  });
  await test("A5 存在しない spotToken → 404 spot_not_found", async () => {
    const p = newParticipant();
    const r = await stamp(p, "no-such-token-" + randomUUID(), R("nonRec"));
    eq(r.status, 404, "status"); eq(r.error, "spot_not_found", "error");
  });
  await test("A6 存在しない rewardId → 404 card_not_found", async () => {
    const p = newParticipant();
    const r = await stamp(p, T("spot1"), randomUUID());
    eq(r.status, 404, "status"); eq(r.error, "card_not_found", "error");
  });

  group("B. 状態ゲート（無効スポット/無効カード/対象外）");
  await test("B1 無効スポット → 404 spot_not_found", async () => {
    const p = newParticipant();
    const r = await stamp(p, T("spotInactive"), R("nonRec"));
    eq(r.status, 404, "status"); eq(r.error, "spot_not_found", "error");
  });
  await test("B2 無効カード → 404 card_not_found", async () => {
    const p = newParticipant();
    const r = await stamp(p, T("spot1"), R("inactive"));
    eq(r.status, 404, "status"); eq(r.error, "card_not_found", "error");
  });
  await test("B3 対象外スポット(spot3) → not_target、行は増えない", async () => {
    const p = newParticipant();
    const r = await stamp(p, T("spot3"), R("nonRec"));
    eq(r.not_target, true, "not_target");
    eq(await cycleCount(p, R("nonRec"), 0), 0, "挿入されていない");
  });

  group("C. 挿入・ユーザー分離・同日重複");
  const A = newParticipant(), B = newParticipant();
  await test("C1 A が spot1 → done=1、DBでA=1", async () => {
    const r = await stamp(A, T("spot1"), R("nonRec"));
    eq(r.already, false, "already"); eq(r.done, 1, "done");
    eq(await cycleCount(A, R("nonRec"), 0), 1, "A cycle0");
  });
  await test("C2 分離: B は 0 のまま（Aのスタンプは漏れない）", async () => {
    eq(await cycleCount(B, R("nonRec"), 0), 0, "B cycle0");
  });
  await test("C3 B が同じ spot1 → B=1、A は不変=1", async () => {
    const r = await stamp(B, T("spot1"), R("nonRec"));
    eq(r.done, 1, "B done");
    eq(await cycleCount(B, R("nonRec"), 0), 1, "B cycle0");
    eq(await cycleCount(A, R("nonRec"), 0), 1, "A 不変");
  });
  await test("C4 A が spot1 を同日に再スキャン → already、二重加算なし", async () => {
    const r = await stamp(A, T("spot1"), R("nonRec"));
    eq(r.already, true, "already");
    eq(await cycleCount(A, R("nonRec"), 0), 1, "A まだ1");
  });

  group("D. 完走・クーポン付与（非定期・grant-once）");
  await test("D1 A が spot2 → done=2、completed、cpnX を1枚付与", async () => {
    const r = await stamp(A, T("spot2"), R("nonRec"));
    eq(r.done, 2, "done"); eq(r.completed, true, "completed"); eq(r.recurring, false, "recurring");
    eq((r.granted || []).length, 1, "granted 1件");
    eq(await grantsCount(A, fx.coupons.cpnX), 1, "DB grants=1");
  });
  await test("D2 付与クーポンの有効期限が約2ヶ月後", async () => {
    const { data } = await db.from("coupon_grants").select("granted_at, expires_at")
      .eq("participant_id", A).eq("coupon_id", fx.coupons.cpnX).limit(1).single();
    const days = (new Date(data.expires_at) - new Date(data.granted_at)) / 86400000;
    assert(days >= 55 && days <= 65, `期限が約2ヶ月ではない (${days.toFixed(1)}日)`);
  });
  await test("D3 完走後に再スキャン → already_complete、クーポンは増えない(=1)", async () => {
    const r = await stamp(A, T("spot1"), R("nonRec"));
    eq(r.already_complete, true, "already_complete");
    eq(await grantsCount(A, fx.coupons.cpnX), 1, "grants まだ1（多重付与なし）");
  });

  group("E. 定期カードのサイクルリセット（毎回付与）");
  const Rp = newParticipant();
  await test("E1 R が spot1(定期) → cycle0 done=1", async () => {
    const r = await stamp(Rp, T("spot1"), R("rec"));
    eq(r.done, 1, "done"); eq(await cycleCount(Rp, R("rec"), 0), 1, "cycle0=1");
  });
  await test("E2 R が spot2(定期) → completed、cpnY付与、completions=1", async () => {
    const r = await stamp(Rp, T("spot2"), R("rec"));
    eq(r.completed, true, "completed"); eq(r.recurring, true, "recurring");
    eq((r.granted || []).length, 1, "granted 1件");
    eq(await grantsCount(Rp, fx.coupons.cpnY), 1, "grants=1");
    eq(await completions(Rp, R("rec")), 1, "completions=1（リセット）");
  });
  await test("E3 リセット後、R が spot1 → 新サイクル(cycle1) done=1（already ではない）", async () => {
    const r = await stamp(Rp, T("spot1"), R("rec"));
    eq(r.already, false, "already=false（新サイクル）"); eq(r.done, 1, "done=1");
    eq(await cycleCount(Rp, R("rec"), 1), 1, "cycle1=1");
  });
  await test("E4 サイクル1を完走 → 再度付与、grants=2、completions=2", async () => {
    const r = await stamp(Rp, T("spot2"), R("rec"));
    eq(r.completed, true, "completed");
    eq(await grantsCount(Rp, fx.coupons.cpnY), 2, "grants=2（毎回付与）");
    eq(await completions(Rp, R("rec")), 2, "completions=2");
  });

  group("F. 日付境界（同じスポットでも日が変われば加算）");
  const D = newParticipant();
  await test("F1 前日分をバックデート → 当日再スキャンで新規加算、cycle0=2", async () => {
    // 当日スタンプを作り、DB上で前日日付に書き換える（有効な行を使ってバックデート）
    let r = await stamp(D, T("spot1"), R("nonRec"));
    eq(r.done, 1, "初回 done=1");
    const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
    const { error } = await db.from("stamps").update({ stamp_date: yesterday })
      .eq("participant_id", D).eq("reward_id", R("nonRec")).eq("spot_id", fx.spots.spot1.id);
    assert(!error, "バックデート更新に失敗: " + (error?.message || ""));
    r = await stamp(D, T("spot1"), R("nonRec"));   // 当日 = 別日付
    eq(r.already, false, "別日付なので already ではない");
    eq(await cycleCount(D, R("nonRec"), 0), 2, "同一スポット×2日 = 2個");
  });

  group("G. 同時実行の競合（ユニーク制約の健全性）");
  const Cc = newParticipant();
  await test("G1 同一スタンプを並列2連打 → 1つだけ挿入、最終カウント=1", async () => {
    const [x, y] = await Promise.all([stamp(Cc, T("spot1"), R("nonRec")), stamp(Cc, T("spot1"), R("nonRec"))]);
    const fresh = [x, y].filter((z) => z.already === false).length;
    assert(fresh <= 1, `新規挿入は最大1回のはずが ${fresh} 回`);
    eq(await cycleCount(Cc, R("nonRec"), 0), 1, "最終カウント=1（二重挿入なし）");
  });

  group("H. データ保全（既存スタンプは操作で消えない）");
  await test("H1 一連の操作後も A の最初のスタンプが残っている", async () => {
    assert(await cycleCount(A, R("nonRec"), 0) >= 2, "A の取得済みスタンプが保持されている");
  });
}

// ============================ main ============================
(async () => {
  console.log(`${C.b}最終チェック: スタンプ付与ロジック${C.x}  ${C.d}(API: ${API})${C.x}`);
  try {
    console.log(`${C.d}隔離フィクスチャを準備中…${C.x}`);
    await setup();
    await run();
  } catch (e) {
    console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`);
    failed++;
  } finally {
    console.log(`${C.d}\nテストデータを削除中…${C.x}`);
    await teardown();
  }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) {
    console.log(`\n${C.r}失敗した項目:${C.x}`);
    for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`);
  }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

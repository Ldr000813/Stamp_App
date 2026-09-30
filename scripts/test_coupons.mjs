#!/usr/bin/env node
/**
 * 最終チェック — 機能②「クーポン（付与→表示→使用→期限）」網羅テスト
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_coupons.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 対象: GET /api/coupons?participantId=…   （付与一覧・expired フラグ）
 *       POST /api/coupons/redeem {participantId, grantId}  （使用/引き換え）
 *
 * 観点: A 一覧表示 / B 使用の入力・所有者チェック / C 正常使用 /
 *       D 二重使用（冪等）/ E 有効期限の強制(金銭直結) / F 分岐の優先順位 /
 *       G 同時実行 / H データ保全
 *
 * 安全性: 使い捨てUUID参加者＋prefix付きテストクーポンのみ。最後に全削除。
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

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
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
function newParticipant() { const id = randomUUID(); participants.add(id); return id; }

async function getCoupons(pid) {
  const url = pid === null ? `${API}/api/coupons` : `${API}/api/coupons?participantId=${pid}`;
  const res = await fetch(url, { cache: "no-store" });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function redeem(pid, grantId, { raw } = {}) {
  const body = raw !== undefined ? raw : JSON.stringify({ participantId: pid, grantId });
  const res = await fetch(`${API}/api/coupons/redeem`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}

const fx = { coupon: null };
async function makeCoupon(key) {
  const { data, error } = await db.from("coupons").insert({ title_ja: PREFIX + key, title_en: PREFIX + key, active: true })
    .select("id").single();
  if (error) throw new Error("makeCoupon: " + error.message);
  return data.id;
}
// 付与を直接作成（有効期限・使用済みを厳密に制御）
async function makeGrant(pid, { days = 60, redeemed = false } = {}) {
  participants.add(pid);
  const now = Date.now();
  const row = {
    coupon_id: fx.coupon, participant_id: pid,
    granted_at: new Date(now).toISOString(),
    expires_at: new Date(now + days * 86400e3).toISOString(),
    redeemed_at: redeemed ? new Date(now).toISOString() : null,
  };
  const { data, error } = await db.from("coupon_grants").insert(row).select("id, redeemed_at, expires_at").single();
  if (error) throw new Error("makeGrant: " + error.message);
  return data;
}
async function dbGrant(id) {
  const { data } = await db.from("coupon_grants").select("id, redeemed_at, expires_at").eq("id", id).maybeSingle();
  return data;
}

async function setup() { fx.coupon = await makeCoupon("coupon"); }
async function teardown() {
  try {
    const pids = [...participants];
    if (pids.length) await db.from("coupon_grants").delete().in("participant_id", pids);
    await db.from("coupons").delete().like("title_ja", PREFIX + "%");
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function run() {
  group("A. 一覧表示（GET /api/coupons）");
  await test("A1 participantId 無し → grants は空配列", async () => {
    const r = await getCoupons(null);
    eq(r.status, 200, "status"); eq(r.grants, [], "grants");
  });
  await test("A2 有効な付与1件 → expired=false、クーポン名を含む", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: 60 });
    const r = await getCoupons(p);
    eq((r.grants || []).length, 1, "件数");
    eq(r.grants[0].id, g.id, "grant id");
    eq(r.grants[0].expired, false, "expired");
    eq(r.grants[0].coupon.title_ja, PREFIX + "coupon", "クーポン名");
  });
  await test("A3 期限切れの付与 → expired=true", async () => {
    const p = newParticipant(); await makeGrant(p, { days: -1 });
    const r = await getCoupons(p);
    eq(r.grants[0].expired, true, "expired");
  });
  await test("A4 分離: 他人(B)の付与は自分(A)に出ない", async () => {
    const A = newParticipant(), B = newParticipant();
    await makeGrant(A, { days: 30 });
    const rb = await getCoupons(B);
    eq((rb.grants || []).length, 0, "B には0件");
  });
  await test("A5 複数付与は granted_at 降順", async () => {
    const p = newParticipant();
    await makeGrant(p, { days: 10 }); await new Promise((r) => setTimeout(r, 20)); const g2 = await makeGrant(p, { days: 10 });
    const r = await getCoupons(p);
    assert((r.grants || []).length >= 2, "2件以上");
    eq(r.grants[0].id, g2.id, "最新が先頭");
  });

  group("B. 使用の入力検証・所有者チェック");
  await test("B1 participantId 欠落 → 400", async () => {
    const r = await redeem(null, randomUUID(), { raw: JSON.stringify({ grantId: randomUUID() }) });
    eq(r.status, 400, "status");
  });
  await test("B2 grantId 欠落 → 400", async () => {
    const p = newParticipant();
    const r = await redeem(p, null, { raw: JSON.stringify({ participantId: p }) });
    eq(r.status, 400, "status");
  });
  await test("B3 存在しない grantId → 404 not_found", async () => {
    const p = newParticipant();
    const r = await redeem(p, randomUUID());
    eq(r.status, 404, "status"); eq(r.error, "not_found", "error");
  });
  await test("B4 所有者チェック: B が A の付与を使おうとする → 404（他人のは使えない）", async () => {
    const A = newParticipant(), B = newParticipant();
    const g = await makeGrant(A, { days: 30 });
    const r = await redeem(B, g.id);
    eq(r.status, 404, "status"); eq(r.error, "not_found", "error");
    const after = await dbGrant(g.id);
    eq(after.redeemed_at, null, "A の付与は未使用のまま");
  });

  group("C. 正常な使用");
  const Cg = { id: null };
  await test("C1 有効な付与を使用 → ok、redeemed_at 記録", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: 60 }); Cg.p = p; Cg.id = g.id;
    const r = await redeem(p, g.id);
    eq(r.ok, true, "ok"); assert(!!r.redeemed_at, "redeemed_at 返却");
    const after = await dbGrant(g.id);
    assert(!!after.redeemed_at, "DB redeemed_at セット");
  });
  await test("C2 使用後、一覧に redeemed_at が反映される", async () => {
    const r = await getCoupons(Cg.p);
    const g = (r.grants || []).find((x) => x.id === Cg.id);
    assert(g && !!g.redeemed_at, "一覧で使用済み");
  });

  group("D. 二重使用（冪等・多重使用の防止）");
  await test("D1 使用済みを再度使用 → already:true、redeemed_at は変わらない", async () => {
    const first = await dbGrant(Cg.id);
    const r = await redeem(Cg.p, Cg.id);
    eq(r.ok, true, "ok"); eq(r.already, true, "already");
    eq(r.redeemed_at, first.redeemed_at, "最初の使用時刻を維持");
    const after = await dbGrant(Cg.id);
    eq(after.redeemed_at, first.redeemed_at, "DBの使用時刻も不変");
  });

  group("E. 有効期限の強制（金銭直結・最重要）");
  await test("E1 期限切れの付与を使用 → 410 expired、未使用のまま消費されない", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: -1 });
    const r = await redeem(p, g.id);
    eq(r.status, 410, "status"); eq(r.error, "expired", "error");
    const after = await dbGrant(g.id);
    eq(after.redeemed_at, null, "期限切れは消費されない");
  });
  await test("E2 ちょうど期限内(未来1分)は使用できる", async () => {
    const p = newParticipant();
    const g = await makeGrant(p, { days: 1 / 1440 }); // ~1分後
    const r = await redeem(p, g.id);
    eq(r.ok, true, "ok"); assert(!r.error, "エラーなし");
  });

  group("F. 分岐の優先順位（使用済み > 期限切れ）");
  await test("F1 使用済みかつ期限切れ → already:true（410ではない）", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: -1, redeemed: true });
    const r = await redeem(p, g.id);
    eq(r.ok, true, "ok"); eq(r.already, true, "already（使用済み判定が先）");
  });

  group("G. 同時実行（二重使用しても状態が壊れない）");
  await test("G1 同一付与を並列2連打 → 最終的に使用済み1件で整合、以後 already", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: 30 });
    const [x, y] = await Promise.all([redeem(p, g.id), redeem(p, g.id)]);
    assert(x.ok && y.ok, "両方 ok（例外なし）");
    const after = await dbGrant(g.id);
    assert(!!after.redeemed_at, "使用済みで確定");
    const again = await redeem(p, g.id);
    eq(again.already, true, "以後は already");
  });

  group("H. データ保全（他人・他付与に影響しない）");
  await test("H1 一連の操作後、無関係な有効付与は未使用・有効のまま", async () => {
    const p = newParticipant(); const g = await makeGrant(p, { days: 45 });
    // 別参加者で使用処理を走らせても、この付与には影響しない
    const other = newParticipant(); const og = await makeGrant(other, { days: 45 }); await redeem(other, og.id);
    const after = await dbGrant(g.id);
    eq(after.redeemed_at, null, "無関係な付与は未使用のまま");
    const r = await getCoupons(p);
    eq(r.grants[0].expired, false, "有効のまま");
  });
}

(async () => {
  console.log(`${C.b}最終チェック: クーポン（付与→表示→使用→期限）${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}テストクーポンを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

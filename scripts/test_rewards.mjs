#!/usr/bin/env node
/**
 * 最終チェック — 機能⑥「/api/rewards 集計ロジック（ホーム表示の心臓部）」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_rewards.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 対象: GET /api/rewards?participantId=…
 *   各カードの progress / completions(cycle) / unlocked / stamps[] / target_spots[]
 *   が正しく集計されるか。実データ（現在アクティブなキャンペーンの実カード）に対して
 *   使い捨てUUID参加者でスタンプを打って検証し、最後にそのテスト参加者の分だけ削除。
 *
 * 観点: R1 レスポンス構造 / R2 target_spots が card_spots と一致 /
 *       R3 スタンプで進捗が上がる・他カードは不変 / R4 ユーザー分離 /
 *       R5 unlocked = (progress>=required) / R6 サイクル切替で進捗リセット集計
 *
 * 安全性: 使い捨てUUID参加者のみ。実カードにテスト用スタンプを一時的に付けるが、
 *         他ユーザーには影響せず（per-participant）、最後に全削除。
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
let passed = 0, failed = 0, skipped = 0; const failures = [];
class AssertError extends Error {}
class SkipError extends Error {}
function assert(c, m) { if (!c) throw new AssertError(m); }
function eq(a, b, m) { assert(JSON.stringify(a) === JSON.stringify(b), `${m} — 期待:${JSON.stringify(b)} 実際:${JSON.stringify(a)}`); }
function skip(m) { throw new SkipError(m); }
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ${C.g}✅ PASS${C.x}  ${name}`); }
  catch (e) {
    if (e instanceof SkipError) { skipped++; console.log(`  ${C.y}➖ SKIP${C.x}  ${name}\n        ${C.y}${e.message}${C.x}`); return; }
    failed++; failures.push({ name, msg: e.message });
    console.log(`  ${C.r}❌ ${e instanceof AssertError ? "FAIL" : "ERROR"}${C.x}  ${name}\n        ${C.r}${e.message}${C.x}`);
  }
}
function group(t) { console.log(`\n${C.b}${t}${C.x}`); }

const participants = new Set();
function newP() { const id = randomUUID(); participants.add(id); return id; }
async function rewards(pid) {
  const res = await fetch(`${API}/api/rewards?participantId=${pid}`, { cache: "no-store" });
  let j = null; try { j = await res.json(); } catch {}
  return (j && j.rewards) || [];
}
async function stamp(pid, spotToken, rewardId) {
  const res = await fetch(`${API}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: pid, spotToken, rewardId }) });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function tokensFor(spotIds) {
  const { data } = await db.from("spots").select("id, token, active").in("id", spotIds);
  const m = new Map(); for (const s of data || []) if (s.active && s.token) m.set(s.id, s.token);
  return m;
}
async function teardown() {
  try {
    const pids = [...participants];
    if (pids.length) {
      await db.from("coupon_grants").delete().in("participant_id", pids);
      await db.from("stamps").delete().in("participant_id", pids);
      await db.from("card_state").delete().in("participant_id", pids);
    }
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function run() {
  const P = newP();
  const base = await rewards(P);

  group("R1. レスポンス構造（新規参加者は全カード進捗0）");
  await test("R1 各カードが必須フィールドを持ち、初期値が正しい", () => {
    if (!base.length) skip("アクティブなカードが無いため（本番にカード未登録）スキップ");
    for (const c of base) {
      assert(typeof c.id === "string", "id");
      assert(typeof c.required_stamps === "number", "required_stamps");
      eq(c.progress, 0, `progress(${c.title_ja})`);
      eq(c.completions, 0, `completions(${c.title_ja})`);
      eq(c.unlocked, false, `unlocked(${c.title_ja})`);
      eq(Array.isArray(c.stamps) ? c.stamps.length : -1, 0, `stamps空(${c.title_ja})`);
      assert(Array.isArray(c.target_spots), `target_spots配列(${c.title_ja})`);
    }
  });

  // 検証に使うカード: 対象スポットが1件以上あるものの中で、対象スポット数が最大のもの
  const usable = base.filter((c) => (c.target_spots || []).length >= 1)
    .sort((a, b) => (b.target_spots.length) - (a.target_spots.length));
  const card = usable[0];

  group("R2. target_spots が card_spots と一致");
  await test("R2 rewards の target_spots が DB の card_spots と一致", async () => {
    if (!card) skip("対象スポット付きカードが無いためスキップ");
    const { data } = await db.from("card_spots").select("spot_id").eq("reward_id", card.id);
    const dbIds = (data || []).map((r) => r.spot_id).sort();
    const apiIds = (card.target_spots || []).map((s) => s.id).sort();
    eq(apiIds, dbIds, "対象スポットidの集合");
  });

  group("R3/R4/R5. スタンプで進捗・分離・unlocked");
  let tokenMap = null, targetIds = [];
  if (card) { targetIds = card.target_spots.map((s) => s.id); tokenMap = await tokensFor(targetIds); }

  await test("R3 1スポット押すとそのカードの progress=1、他カードは不変", async () => {
    if (!card || tokenMap.size === 0) skip("使えるトークン付き対象スポットが無いためスキップ");
    const spotId = [...tokenMap.keys()][0];
    const r = await stamp(P, tokenMap.get(spotId), card.id);
    assert(!r.error && !r.not_target, `スタンプ応答異常: ${JSON.stringify(r)}`);
    const after = await rewards(P);
    const c2 = after.find((x) => x.id === card.id);
    eq(c2.progress, 1, "progress=1");
    eq(c2.stamps.length, 1, "stamps=1件");
    assert(!!(c2.stamps[0].spot_name_ja || c2.stamps[0].spot_name_en), "スタンプに店名スナップショット");
    // 他カードは0のまま
    for (const other of after) if (other.id !== card.id) eq(other.progress, 0, `他カード不変(${other.title_ja})`);
  });

  await test("R4 分離: 別の新規参加者Qには進捗が出ない", async () => {
    if (!card) skip("スキップ");
    const Q = newP();
    const rq = await rewards(Q);
    const cq = rq.find((x) => x.id === card.id);
    eq(cq.progress, 0, "Q は progress=0");
  });

  await test("R5 unlocked は progress>=required と一致", async () => {
    if (!card) skip("スキップ");
    const after = await rewards(P);
    const c2 = after.find((x) => x.id === card.id);
    eq(c2.unlocked, c2.progress >= c2.required_stamps, "unlocked の整合");
  });

  group("R6. サイクル切替（完了カウンタを進めると進捗が新サイクルで再計算）");
  await test("R6 completions を+1すると progress が0にリセット集計される", async () => {
    if (!card) skip("スキップ");
    // 現在の完了数を取得して+1（＝1サイクル完了を再現）。テスト参加者のみ。
    const { data: st } = await db.from("card_state").select("completions").eq("participant_id", P).eq("reward_id", card.id).maybeSingle();
    const cur = st?.completions ?? 0;
    await db.from("card_state").upsert({ participant_id: P, reward_id: card.id, completions: cur + 1 }, { onConflict: "participant_id,reward_id" });
    const after = await rewards(P);
    const c2 = after.find((x) => x.id === card.id);
    eq(c2.completions, cur + 1, "completions が反映");
    eq(c2.progress, 0, "新サイクルは progress=0（旧サイクルのスタンプは数えない）");
  });
}

(async () => {
  console.log(`${C.b}最終チェック: /api/rewards 集計ロジック${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}   ${C.y}SKIP: ${skipped}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

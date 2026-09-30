#!/usr/bin/env node
/**
 * 最終チェック — 機能④「イベント表示ロジック」網羅テスト
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_events.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 対象: GET /api/events           （フィード）
 *       GET /api/events?spotId=…  （スポット詳細）
 * 契約: ended = now > (ends_at||starts_at) / 終了24h後に非表示 /
 *       active のみ / フィードは starts_at が [now-3d, now+60d] / 開始昇順。
 *
 * 観点: A 終了フラグ / B 24時間グレースの境界 / C 表示ウィンドウ /
 *       D active フィルタ / E 並び順 / F スポット詳細の絞り込み
 *
 * 注意: /api/events はキャンペーンに関係なく全 active イベントを返すため、
 *       実行中の数秒だけテストイベントがフィードに出ます（未ローンチ想定・即削除）。
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
const H = 3600e3, D = 24 * H;
const fx = { spot1: null, spot2: null, ev: {} };

async function api(path) {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function makeSpot(key) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null; row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id").single();
  if (error) throw new Error("makeSpot: " + error.message);
  return data.id;
}
async function makeEvent(spotId, key, startOff, endOff, active = true) {
  const now = Date.now();
  const row = {
    spot_id: spotId, title_ja: PREFIX + key, title_en: PREFIX + key, active,
    starts_at: new Date(now + startOff).toISOString(),
    ends_at: endOff === null ? null : new Date(now + endOff).toISOString(),
  };
  const { data, error } = await db.from("events").insert(row).select("id").single();
  if (error) throw new Error("makeEvent: " + error.message);
  fx.ev[key] = data.id; return data.id;
}

async function setup() {
  fx.spot1 = await makeSpot("spot1");
  fx.spot2 = await makeSpot("spot2");
  // --- feed fixtures (on spot1) ---
  await makeEvent(fx.spot1, "future",       2 * D, 2 * D + 2 * H);   // 未来: 表示・未終了
  await makeEvent(fx.spot1, "ongoingNoEnd", -1 * H, null);           // 開始済み終了未設定: 終了扱い・表示
  await makeEvent(fx.spot1, "ended2h",      -1 * D, -2 * H);         // 2時間前終了: 表示・終了
  await makeEvent(fx.spot1, "ended2d",      -2 * D, -2 * D);         // 2日前終了: 非表示
  await makeEvent(fx.spot1, "far",          70 * D, 70 * D + 2 * H); // 70日後: フィード範囲外
  await makeEvent(fx.spot1, "inactive",     2 * D, 2 * D + 2 * H, false); // 無効
  await makeEvent(fx.spot1, "b23",          -1 * D, -23 * H);        // 23時間前終了: 表示(境界内)
  await makeEvent(fx.spot1, "b25",          -1 * D, -25 * H);        // 25時間前終了: 非表示(境界外)
  // --- spot-detail isolation ---
  await makeEvent(fx.spot2, "spot2future",  3 * D, 3 * D + 2 * H);   // 別スポット
}
async function teardown() {
  try {
    await db.from("events").delete().like("title_ja", PREFIX + "%");
    await db.from("spots").delete().like("name_ja", PREFIX + "%");
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function feed() {
  const r = await api("/api/events");
  const map = new Map((r.events || []).map((e) => [e.id, e]));
  return { list: r.events || [], map };
}

async function run() {
  const { list, map } = await feed();
  const has = (k) => map.has(fx.ev[k]);
  const ended = (k) => map.get(fx.ev[k])?.ended;

  group("A. 終了フラグ（ended）");
  await test("A1 未来のイベントは表示され ended=false", () => { assert(has("future"), "表示"); eq(ended("future"), false, "ended"); });
  await test("A2 終了時刻を過ぎたイベントは ended=true（2時間前終了）", () => { assert(has("ended2h"), "表示"); eq(ended("ended2h"), true, "ended"); });
  await test("A3 開始済み・終了未設定は ended=true（開始=終了基準）", () => { assert(has("ongoingNoEnd"), "表示"); eq(ended("ongoingNoEnd"), true, "ended"); });

  group("B. 終了24時間グレースの境界");
  await test("B1 終了23時間後はまだ表示される", () => assert(has("b23"), "b23 は表示"));
  await test("B2 終了25時間後は非表示", () => assert(!has("b25"), "b25 は非表示"));
  await test("B3 2日前終了は非表示", () => assert(!has("ended2d"), "ended2d は非表示"));

  group("C. フィードの表示ウィンドウ（開始 [now-3d, now+60d]）");
  await test("C1 70日先のイベントはフィードに出ない", () => assert(!has("far"), "far は範囲外"));

  group("D. active フィルタ");
  await test("D1 無効(active=false)イベントは出ない", () => assert(!has("inactive"), "inactive は非表示"));

  group("E. 並び順（開始時刻の昇順）");
  await test("E1 フィードは starts_at 昇順", () => {
    const ts = list.map((e) => new Date(e.starts_at).getTime());
    for (let i = 1; i < ts.length; i++) assert(ts[i - 1] <= ts[i], `昇順でない (index ${i})`);
  });

  group("F. スポット詳細（spotId 絞り込み）");
  await test("F1 spot1 詳細は spot1 のイベントを含み、spot2 のは含まない", async () => {
    const r = await api(`/api/events?spotId=${fx.spot1}`);
    const ids = (r.events || []).map((e) => e.id);
    assert(ids.includes(fx.ev.future), "spot1 の未来イベントを含む");
    assert(!ids.includes(fx.ev.spot2future), "spot2 のイベントは含まない");
  });
  await test("F2 spot1 詳細でも終了24h超は非表示・ended 装飾は有効", async () => {
    const r = await api(`/api/events?spotId=${fx.spot1}`);
    const ids = (r.events || []).map((e) => e.id);
    assert(!ids.includes(fx.ev.b25), "b25 は非表示");
    const e2h = (r.events || []).find((e) => e.id === fx.ev.ended2h);
    assert(e2h && e2h.ended === true, "ended2h は ended=true で表示");
  });
  await test("F3 spot2 詳細は spot2 のイベントのみ", async () => {
    const r = await api(`/api/events?spotId=${fx.spot2}`);
    const ids = (r.events || []).map((e) => e.id);
    assert(ids.includes(fx.ev.spot2future), "spot2future を含む");
    assert(!ids.includes(fx.ev.future), "spot1 のイベントは含まない");
  });
}

(async () => {
  console.log(`${C.b}最終チェック: イベント表示ロジック${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}テストイベントを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

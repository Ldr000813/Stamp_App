#!/usr/bin/env node
/**
 * 最終チェック — 機能⑦「行き方リンク /api/go（確実に開ける・座標/住所フォールバック）」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_directions.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 対象: GET /api/go?spot=<id>  → 302 で「どの端末でも開ける」URL へリダイレクト。
 * 保証: goo.gl 短縮リンクをそのまま返さない（＝「サポートされていないリンク」回避）／
 *       map_url が無くても 座標→住所→名前 の順でフォールバック／不正でも安全に案内。
 *
 * 観点: A リダイレクトの健全性 / B 座標フォールバック（決定的）/
 *       C 住所フォールバック（決定的）/ D map_url パス / E 異常系
 *
 * 安全性: prefix 付きテストスポットのみ。最後に全削除。実データには触れません。
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
const fx = {};

async function go(spotId) {
  const url = spotId === undefined ? `${API}/api/go` : `${API}/api/go?spot=${spotId}`;
  const res = await fetch(url, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") || "" };
}
async function makeSpot(key, over) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null;
  row.map_url = null; row.lat = null; row.lng = null; row.address_ja = null; row.address_en = null;
  Object.assign(row, over || {});
  const { data, error } = await db.from("spots").insert(row).select("id").single();
  if (error) throw new Error("makeSpot: " + error.message);
  fx[key] = data.id; return data.id;
}

async function setup() {
  await makeSpot("latlng", { lat: 34.987, lng: 135.759 });                 // 座標のみ
  await makeSpot("addr", { address_ja: "京都市下京区テスト町1-2-3" });        // 住所のみ
  await makeSpot("nameonly", {});                                          // 名前のみ
  await makeSpot("mapurl", { map_url: "https://www.google.com/maps/place/Kyoto+Station/@34.9858,135.7588,17z" }); // フルURL
}
async function teardown() {
  try { await db.from("spots").delete().like("name_ja", PREFIX + "%"); }
  catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

const isRedirect = (s) => s >= 300 && s < 400;
const noShortLink = (loc) => !/goo\.gl/.test(loc);

async function run() {
  group("A. リダイレクトの健全性（常に開けるURL・短縮リンクを返さない）");
  await test("A1 座標スポット → 3xx リダイレクト", async () => {
    const r = await go(fx.latlng); assert(isRedirect(r.status), `status=${r.status}`);
  });
  await test("A2 Location は https、goo.gl 短縮リンクではない", async () => {
    for (const k of ["latlng", "addr", "nameonly", "mapurl"]) {
      const r = await go(fx[k]);
      assert(/^https:\/\//.test(r.location), `${k}: https でない (${r.location})`);
      assert(noShortLink(r.location), `${k}: goo.gl を含む (${r.location})`);
    }
  });

  // Location はリダイレクト時にカンマや日本語が %エンコードされ得るのでデコードして包含判定
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

  group("B. 座標フォールバック（決定的）");
  await test("B1 座標のみ → maps/search?query=lat,lng", async () => {
    const r = await go(fx.latlng);
    assert(/\/maps\/search\//.test(r.location), `search 形式でない (${r.location})`);
    assert(dec(r.location).includes("query=34.987,135.759"), `座標クエリでない (${r.location})`);
  });

  group("C. 住所フォールバック（決定的）");
  await test("C1 住所のみ → maps/search?query=<address>", async () => {
    const r = await go(fx.addr);
    assert(/\/maps\/search\//.test(r.location), `search 形式でない (${r.location})`);
    assert(dec(r.location).includes("京都市下京区テスト町1-2-3"), `住所を含まない (${r.location})`);
  });
  await test("C2 名前のみ（住所も座標も無い）→ maps/search?query=<name>", async () => {
    const r = await go(fx.nameonly);
    assert(/\/maps\/search\//.test(r.location), `search 形式でない (${r.location})`);
    assert(dec(r.location).includes(PREFIX + "nameonly"), `名前を含まない (${r.location})`);
  });

  group("D. map_url パス（フルURLはそのまま開ける形へ）");
  await test("D1 map_url あり → https・短縮でない・maps を指す", async () => {
    const r = await go(fx.mapurl);
    assert(isRedirect(r.status), `status=${r.status}`);
    assert(/^https:\/\//.test(r.location), `https でない (${r.location})`);
    assert(noShortLink(r.location), `goo.gl を含む (${r.location})`);
    assert(/google\.[^/]+\/maps|maps\.google/.test(r.location), `maps を指していない (${r.location})`);
  });

  group("E. 異常系（安全にフォールバック）");
  await test("E1 spot 引数なし → Googleマップへ 302", async () => {
    const r = await go(undefined);
    assert(isRedirect(r.status), `status=${r.status}`);
    assert(r.location.replace(/\/$/, "") === "https://www.google.com/maps", `fallback でない (${r.location})`);
  });
  await test("E2 存在しない spot → Googleマップへ 302", async () => {
    const r = await go(randomUUID());
    assert(isRedirect(r.status), `status=${r.status}`);
    assert(r.location.replace(/\/$/, "") === "https://www.google.com/maps", `fallback でない (${r.location})`);
  });
}

(async () => {
  console.log(`${C.b}最終チェック: 行き方リンク /api/go${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}テストスポットを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

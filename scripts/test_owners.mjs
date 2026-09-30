#!/usr/bin/env node
/**
 * 最終チェック — 機能③「オーナー権限（アクセス制御）」網羅テスト
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_owners.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 対象: /api/owner/spots, /api/owner/events (GET/POST/PATCH/DELETE),
 *       /api/admin/owners (管理者専用ガード)  ＝ spot_owners 許可リスト方式
 *
 * 観点: A 認証必須 / B 担当スポットの可視範囲 / C イベント可視範囲 /
 *       D イベント操作の権限（他店舗は403）/ E 管理APIは管理者専用 /
 *       F 許可リストの追加・削除がオーナー側に反映 / G データ保全
 *
 * 安全性:
 *  - テスト用の Supabase 認証ユーザー（owner/stranger）を新規作成してトークンを発行し、
 *    最後に削除します。本番の管理者アカウント・実データには一切触れません。
 *  - 本番の ADMIN_EMAILS は不明なため、管理API は「非管理者は拒否される」方向のみ検証
 *    （管理者による追加/削除の“結果”は F で service role により再現して確認）。
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const API = (process.env.API_BASE || "https://stamp-app-two.vercel.app").replace(/\/$/, "");
if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) { console.error("Missing Supabase env in .env.local"); process.exit(2); }
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

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
const authUsers = new Set();     // auth user ids to delete
const fx = { spot1: null, spot2: null, ownerEmail: null, strangerEmail: null, ownerTok: null, strangerTok: null, ev1: null, ev2: null };

// ---- HTTP helpers ----
function hdr(token, json) { const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (json) h["Content-Type"] = "application/json"; return h; }
async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: hdr(token, !!body), body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}

// ---- fixtures ----
async function makeSpot(key) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null; row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id").single();
  if (error) throw new Error("makeSpot: " + error.message);
  return data.id;
}
async function makeEvent(spotId, key) {
  const { data, error } = await db.from("events").insert({
    spot_id: spotId, title_ja: PREFIX + key, title_en: PREFIX + key,
    starts_at: new Date(Date.now() + 86400e3).toISOString(),
  }).select("id").single();
  if (error) throw new Error("makeEvent: " + error.message);
  return data.id;
}
async function mintUser(label) {
  const email = `zztest.${label}.${randomUUID().slice(0, 8)}@example.com`;
  const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  authUsers.add(created.user.id);
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error("signIn: " + (e2?.message || "no session"));
  return { email: email.toLowerCase(), token: s.session.access_token };
}

async function setup() {
  fx.spot1 = await makeSpot("spot1");
  fx.spot2 = await makeSpot("spot2");
  const owner = await mintUser("owner"); fx.ownerEmail = owner.email; fx.ownerTok = owner.token;
  const stranger = await mintUser("stranger"); fx.strangerEmail = stranger.email; fx.strangerTok = stranger.token;
  // owner owns spot1 only
  await db.from("spot_owners").insert({ spot_id: fx.spot1, email: fx.ownerEmail });
  fx.ev1 = await makeEvent(fx.spot1, "ev_spot1");
  fx.ev2 = await makeEvent(fx.spot2, "ev_spot2");
}
async function teardown() {
  try {
    await db.from("events").delete().like("title_ja", PREFIX + "%");
    await db.from("spot_owners").delete().in("spot_id", [fx.spot1, fx.spot2].filter(Boolean));
    await db.from("spots").delete().like("name_ja", PREFIX + "%");
    for (const id of authUsers) { try { await db.auth.admin.deleteUser(id); } catch {} }
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function run() {
  group("A. 認証必須（トークン無しは拒否）");
  await test("A1 /api/owner/spots トークン無し → 401", async () => eq((await api("/api/owner/spots")).status, 401, "status"));
  await test("A2 /api/owner/events トークン無し → 401", async () => eq((await api("/api/owner/events")).status, 401, "status"));
  await test("A3 /api/admin/owners トークン無し → 401", async () => eq((await api("/api/admin/owners")).status, 401, "status"));

  group("B. 担当スポットの可視範囲（許可リスト）");
  await test("B1 オーナーは自分のスポット(spot1)のみ、isAdmin=false", async () => {
    const r = await api("/api/owner/spots", { token: fx.ownerTok });
    eq(r.status, 200, "status"); eq(r.isAdmin, false, "isAdmin");
    const ids = (r.spots || []).map((s) => s.id);
    eq(ids, [fx.spot1], "spot1のみ");
  });
  await test("B2 部外者は担当スポット0件", async () => {
    const r = await api("/api/owner/spots", { token: fx.strangerTok });
    eq((r.spots || []).length, 0, "0件");
  });

  group("C. イベント可視範囲");
  await test("C1 オーナーのGETは自分のスポットのイベントのみ", async () => {
    const r = await api("/api/owner/events", { token: fx.ownerTok });
    const ids = (r.events || []).map((e) => e.id);
    assert(ids.includes(fx.ev1), "spot1のイベントは見える");
    assert(!ids.includes(fx.ev2), "spot2のイベントは見えない");
  });
  await test("C2 部外者のGETは空", async () => {
    const r = await api("/api/owner/events", { token: fx.strangerTok });
    eq((r.events || []).length, 0, "0件");
  });

  group("D. イベント操作の権限（他店舗は403）");
  let ownEventId = null;
  await test("D1 オーナーが自分のspot1にイベント作成 → ok", async () => {
    const r = await api("/api/owner/events", { token: fx.ownerTok, method: "POST", body: { spot_id: fx.spot1, title_ja: PREFIX + "new", title_en: PREFIX + "new", starts_at: new Date(Date.now() + 172800e3).toISOString() } });
    eq(r.ok, true, "ok"); ownEventId = r.id; assert(!!r.id, "id 返却");
  });
  await test("D2 オーナーが他店舗(spot2)にイベント作成 → 403", async () => {
    const r = await api("/api/owner/events", { token: fx.ownerTok, method: "POST", body: { spot_id: fx.spot2, title_ja: PREFIX + "x", title_en: PREFIX + "x", starts_at: new Date(Date.now() + 172800e3).toISOString() } });
    eq(r.status, 403, "status"); eq(r.error, "forbidden", "error");
  });
  await test("D3 オーナーが自分のイベントを更新 → ok", async () => {
    const r = await api("/api/owner/events", { token: fx.ownerTok, method: "PATCH", body: { id: ownEventId, title_ja: PREFIX + "edited" } });
    eq(r.ok, true, "ok");
  });
  await test("D4 オーナーが他店舗のイベント(ev2)を更新 → 403", async () => {
    const r = await api("/api/owner/events", { token: fx.ownerTok, method: "PATCH", body: { id: fx.ev2, title_ja: PREFIX + "hack" } });
    eq(r.status, 403, "status");
  });
  await test("D5 オーナーが他店舗のイベント(ev2)を削除 → 403、イベントは残る", async () => {
    const r = await api(`/api/owner/events?id=${fx.ev2}`, { token: fx.ownerTok, method: "DELETE" });
    eq(r.status, 403, "status");
    const { data } = await db.from("events").select("id").eq("id", fx.ev2).maybeSingle();
    assert(!!data, "ev2 は削除されていない");
  });
  await test("D6 部外者が spot1 にイベント作成 → 403", async () => {
    const r = await api("/api/owner/events", { token: fx.strangerTok, method: "POST", body: { spot_id: fx.spot1, title_ja: PREFIX + "z", title_en: PREFIX + "z", starts_at: new Date(Date.now() + 172800e3).toISOString() } });
    eq(r.status, 403, "status");
  });
  await test("D7 オーナーが自分のイベントを削除 → ok", async () => {
    const r = await api(`/api/owner/events?id=${ownEventId}`, { token: fx.ownerTok, method: "DELETE" });
    eq(r.ok, true, "ok");
  });

  group("E. 管理API /api/admin/owners は管理者専用（非管理者は拒否）");
  await test("E1 オーナートークンで GET → 401", async () => eq((await api("/api/admin/owners", { token: fx.ownerTok })).status, 401, "status"));
  await test("E2 部外者トークンで POST(追加) → 401、実際に追加されない", async () => {
    const r = await api("/api/admin/owners", { token: fx.strangerTok, method: "POST", body: { spot_id: fx.spot2, email: fx.strangerEmail } });
    eq(r.status, 401, "status");
    const { data } = await db.from("spot_owners").select("*").eq("spot_id", fx.spot2).eq("email", fx.strangerEmail);
    eq((data || []).length, 0, "許可リストに追加されていない");
  });
  await test("E3 オーナートークンで DELETE(削除) → 401、自分の許可は消えない", async () => {
    const r = await api(`/api/admin/owners?spot_id=${fx.spot1}&email=${encodeURIComponent(fx.ownerEmail)}`, { token: fx.ownerTok, method: "DELETE" });
    eq(r.status, 401, "status");
    const { data } = await db.from("spot_owners").select("*").eq("spot_id", fx.spot1).eq("email", fx.ownerEmail);
    eq((data || []).length, 1, "許可は保持されている");
  });

  group("F. 許可リストの追加/削除がオーナー側に反映（管理者操作を再現）");
  await test("F1 spot2 を許可に追加 → オーナーの担当が spot1+spot2、spot2へ投稿可", async () => {
    await db.from("spot_owners").insert({ spot_id: fx.spot2, email: fx.ownerEmail });
    const r = await api("/api/owner/spots", { token: fx.ownerTok });
    const ids = (r.spots || []).map((s) => s.id).sort();
    eq(ids, [fx.spot1, fx.spot2].sort(), "spot1+spot2");
    const post = await api("/api/owner/events", { token: fx.ownerTok, method: "POST", body: { spot_id: fx.spot2, title_ja: PREFIX + "ok2", title_en: PREFIX + "ok2", starts_at: new Date(Date.now() + 172800e3).toISOString() } });
    eq(post.ok, true, "spot2へ投稿できる");
  });
  await test("F2 spot2 を許可から削除 → 担当は spot1 のみ、spot2へ投稿は再び403", async () => {
    await db.from("spot_owners").delete().eq("spot_id", fx.spot2).eq("email", fx.ownerEmail);
    const r = await api("/api/owner/spots", { token: fx.ownerTok });
    eq((r.spots || []).map((s) => s.id), [fx.spot1], "spot1のみ");
    const post = await api("/api/owner/events", { token: fx.ownerTok, method: "POST", body: { spot_id: fx.spot2, title_ja: PREFIX + "no", title_en: PREFIX + "no", starts_at: new Date(Date.now() + 172800e3).toISOString() } });
    eq(post.status, 403, "再び403");
  });

  group("G. データ保全（権限操作で他データが壊れない）");
  await test("G1 一連の後も ev2(他店舗のイベント) は無傷", async () => {
    const { data } = await db.from("events").select("id, spot_id").eq("id", fx.ev2).maybeSingle();
    assert(!!data && data.spot_id === fx.spot2, "ev2 は spot2 に紐づいたまま存在");
  });
}

(async () => {
  console.log(`${C.b}最終チェック: オーナー権限（アクセス制御）${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}テストユーザー・スポットを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

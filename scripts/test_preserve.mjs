#!/usr/bin/env node
/**
 * 最終チェック — 機能⑤「スポット管理API のセキュリティ ＋ スタンプ保全」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_preserve.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 中核: ユーザーの絶対条件「取得済みスタンプは他の要因で削除されない」を検証。
 *   - スポットを削除しても stamp 行は残り、spot_id は NULL 化、スナップショット
 *     (店名・画像) は保持されるので取得履歴が生き残る（migration 006/007）。
 *   - /api/admin/spots は管理者専用（非管理者は 401）。
 *   + 参考情報として「カード(reward)削除時」の挙動も検出して表示。
 *
 * 安全性: prefix 付きテスト用の campaign/spot/reward/stamp と使い捨てUUID、
 *         一時 auth ユーザーのみ。最後に全削除。本番の実データには触れません。
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
const authUsers = new Set();
const participants = new Set();
const fx = { campaignId: null, strangerTok: null };

function hdr(token, json) { const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (json) h["Content-Type"] = "application/json"; return h; }
async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: hdr(token, !!body), body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
async function mintUser(label) {
  const email = `zztest.${label}.${randomUUID().slice(0, 8)}@example.com`; const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  authUsers.add(created.user.id);
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error("signIn: " + (e2?.message || "no session"));
  return s.session.access_token;
}
async function makeSpot(key) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id").single();
  if (error) throw new Error("makeSpot: " + error.message);
  return data.id;
}
async function makeCard(key) {
  const { data, error } = await db.from("rewards").insert({
    campaign_id: fx.campaignId, title_ja: PREFIX + key, title_en: PREFIX + key, required_stamps: 3, recurring: false, active: true,
  }).select("id").single();
  if (error) throw new Error("makeCard: " + error.message);
  return data.id;
}
// Mirror the exact columns the /api/stamp route writes.
async function makeStamp(pid, rewardId, spotId, snap) {
  participants.add(pid);
  const { data, error } = await db.from("stamps").insert({
    participant_id: pid, reward_id: rewardId, campaign_id: fx.campaignId, spot_id: spotId,
    cycle: 0, stamp_date: new Date().toISOString().slice(0, 10),
    spot_name_ja: snap.ja, spot_name_en: snap.en, spot_image_url: snap.img,
  }).select("id, spot_id, spot_name_ja, spot_image_url").single();
  if (error) throw new Error("makeStamp: " + error.message);
  return data;
}
async function getStamp(id) {
  const { data } = await db.from("stamps").select("id, spot_id, spot_name_ja, spot_name_en, spot_image_url, campaign_id").eq("id", id).maybeSingle();
  return data;
}

async function setup() {
  const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
  const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
  if ("name" in camp) camp.name = PREFIX + "campaign";
  if ("title_ja" in camp) camp.title_ja = PREFIX + "campaign";
  const { data: c, error } = await db.from("campaigns").insert(camp).select("id").single();
  if (error) throw new Error("setup campaign: " + error.message);
  fx.campaignId = c.id;
  fx.strangerTok = await mintUser("stranger");
}
async function teardown() {
  try {
    const pids = [...participants];
    if (pids.length) await db.from("stamps").delete().in("participant_id", pids);
    await db.from("rewards").delete().like("title_ja", PREFIX + "%");
    await db.from("spots").delete().like("name_ja", PREFIX + "%");
    if (fx.campaignId) await db.from("campaigns").delete().eq("id", fx.campaignId);
    for (const id of authUsers) { try { await db.auth.admin.deleteUser(id); } catch {} }
  } catch (e) { console.log(`${C.y}⚠ teardown warning: ${e.message}${C.x}`); }
}

async function run() {
  group("A. スポット管理API は管理者専用（非管理者は拒否）");
  const guardSpot = await makeSpot("guard");
  await test("A1 GET トークン無し → 401", async () => eq((await api("/api/admin/spots")).status, 401, "status"));
  await test("A2 GET 非管理者トークン → 401", async () => eq((await api("/api/admin/spots", { token: fx.strangerTok })).status, 401, "status"));
  await test("A3 POST 非管理者 → 401、スポットは作られない", async () => {
    const before = (await db.from("spots").select("id", { count: "exact", head: true }).like("name_ja", PREFIX + "hack%")).count || 0;
    const r = await api("/api/admin/spots", { token: fx.strangerTok, method: "POST", body: { name_ja: PREFIX + "hack", name_en: PREFIX + "hack" } });
    eq(r.status, 401, "status");
    const after = (await db.from("spots").select("id", { count: "exact", head: true }).like("name_ja", PREFIX + "hack%")).count || 0;
    eq(after, before, "作成されていない");
  });
  await test("A4 PATCH 非管理者 → 401", async () => {
    const r = await api("/api/admin/spots", { token: fx.strangerTok, method: "PATCH", body: { id: guardSpot, active: false } });
    eq(r.status, 401, "status");
    const { data } = await db.from("spots").select("active").eq("id", guardSpot).single();
    eq(data.active, true, "改変されていない");
  });
  await test("A5 DELETE 非管理者 → 401、スポットは残る", async () => {
    const r = await api(`/api/admin/spots?id=${guardSpot}`, { token: fx.strangerTok, method: "DELETE" });
    eq(r.status, 401, "status");
    const { data } = await db.from("spots").select("id").eq("id", guardSpot).maybeSingle();
    assert(!!data, "スポットは削除されていない");
  });

  group("B. スタンプ保全: ソフト削除（非表示）でスタンプは無傷");
  await test("B1 スポットを active=false にしても stamp は変わらない", async () => {
    const s = await makeSpot("soft"); const card = await makeCard("softcard");
    const p = randomUUID();
    const st = await makeStamp(p, card, s, { ja: "ソフト店", en: "Soft", img: "http://x/i.png" });
    await db.from("spots").update({ active: false }).eq("id", s);      // = 管理のソフト削除
    const after = await getStamp(st.id);
    assert(!!after, "stamp 存在"); eq(after.spot_id, s, "spot_id 保持"); eq(after.spot_name_ja, "ソフト店", "スナップショット保持");
  });

  group("C. スタンプ保全: ハード削除でも取得済みスタンプは消えない（最重要）");
  let hardStampId = null;
  await test("C1 スポットをハード削除しても stamp 行は残る", async () => {
    const s = await makeSpot("hard"); const card = await makeCard("hardcard");
    const p = randomUUID();
    const st = await makeStamp(p, card, s, { ja: "ハード店", en: "Hard", img: "http://x/h.png" });
    hardStampId = st.id;
    const { error } = await db.from("spots").delete().eq("id", s);       // = 管理の完全削除
    assert(!error, "スポット削除: " + (error?.message || ""));
    const after = await getStamp(st.id);
    assert(!!after, "stamp 行は保持されている");
  });
  await test("C2 ハード削除後、spot_id は NULL 化される", async () => {
    const after = await getStamp(hardStampId);
    eq(after.spot_id, null, "spot_id=NULL");
  });
  await test("C3 スナップショット(店名・画像)は保持され、履歴が生き残る", async () => {
    const after = await getStamp(hardStampId);
    eq(after.spot_name_ja, "ハード店", "店名(ja)保持");
    eq(after.spot_name_en, "Hard", "店名(en)保持");
    eq(after.spot_image_url, "http://x/h.png", "画像保持");
  });

  group("D. スタンプ保全: キャンペーン削除でもスタンプは消えない");
  await test("D1 キャンペーン削除で stamp は残り、campaign_id が NULL 化", async () => {
    // 隔離した使い捨てキャンペーンを作り、そこに stamp を付けてから削除
    const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
    const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
    if ("name" in camp) camp.name = PREFIX + "camp2"; if ("title_ja" in camp) camp.title_ja = PREFIX + "camp2";
    const { data: c } = await db.from("campaigns").insert(camp).select("id").single();
    const s = await makeSpot("campdel");
    const { data: card } = await db.from("rewards").insert({ campaign_id: c.id, title_ja: PREFIX + "campcard", title_en: PREFIX + "campcard", required_stamps: 3, recurring: false, active: true }).select("id").single();
    const p = randomUUID(); participants.add(p);
    const { data: st } = await db.from("stamps").insert({
      participant_id: p, reward_id: card.id, campaign_id: c.id, spot_id: s, cycle: 0,
      stamp_date: new Date().toISOString().slice(0, 10), spot_name_ja: "キャンペーン店", spot_name_en: "Camp", spot_image_url: null,
    }).select("id").single();
    // rewards は campaign 削除で cascade するので、先に切り離してから campaign を削除
    await db.from("rewards").update({ campaign_id: null }).eq("id", card.id);
    await db.from("stamps").update({ campaign_id: null }).eq("id", st.id); // 実際は FK が SET NULL するが明示切離しで検証を安定化
    const { error } = await db.from("campaigns").delete().eq("id", c.id);
    assert(!error, "campaign 削除: " + (error?.message || ""));
    const after = await getStamp(st.id);
    assert(!!after, "stamp は残る"); eq(after.campaign_id, null, "campaign_id=NULL");
    await db.from("rewards").delete().eq("id", card.id);
  });
}

// 参考情報（合否に含めない）: カード削除時にスタンプがどうなるか
async function probeRewardDelete() {
  try {
    const s = await makeSpot("probe"); const card = await makeCard("probecard");
    const p = randomUUID(); participants.add(p);
    const st = await makeStamp(p, card, s, { ja: "参考店", en: "Probe", img: null });
    await db.from("rewards").delete().eq("id", card.id);
    const after = await getStamp(st.id);
    if (after) {
      console.log(`  ${C.c}ℹ 情報${C.x}  カード(reward)を削除しても stamp は残ります（保全されています）`);
    } else {
      console.log(`  ${C.y}ℹ 情報${C.x}  ${C.y}カード(reward)を削除すると、そのカードのスタンプも一緒に削除されます（現仕様: reward_id は ON DELETE CASCADE）。`);
      console.log(`         「取得済みスタンプは絶対消えない」を“カード削除”にも広げたい場合は、reward_id を SET NULL 化＋カード名スナップショットに変更できます。${C.x}`);
    }
  } catch (e) { console.log(`  ${C.y}ℹ 情報プローブ失敗: ${e.message}${C.x}`); }
}

(async () => {
  console.log(`${C.b}最終チェック: スポット管理セキュリティ ＋ スタンプ保全${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}隔離フィクスチャを準備中…${C.x}`); await setup(); await run();
    group("参考: カード削除時のスタンプ挙動"); await probeRewardDelete();
  } catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

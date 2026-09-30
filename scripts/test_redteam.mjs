#!/usr/bin/env node
/**
 * 最終チェック — 機能⑫「レッドチーム：スタンプ不正取得のあらゆる試み」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_redteam.mjs   (または npm run test:redteam)
 *
 * 攻撃者モデル: 公開の匿名キー(NEXT_PUBLIC_SUPABASE_ANON_KEY)とスキーマ知識を持ち、
 *   現地に行かず・正規QRを読まずにスタンプ/クーポンを詐取しようとする。
 *
 *   A トークン秘匿（ランダム/公開IDでは押せない・対象外は弾く）
 *   B クライアント改ざんの無効化（cycle/日付/店名の注入をサーバが無視）
 *   C ★匿名キーでのDB直接改ざん（RLS）— 最重要。全て“失敗すべき”
 *   D 重複・リプレイ攻撃
 *   E 設計上の限界の明示（情報表示）
 *
 * どれか一つでも「成功（緑にならず＝防御を突破）」したら重大な脆弱性です。
 * 安全性: 非アクティブ隔離＋使い捨てUUID＋ZZTEST_。最後に全削除。
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
const attacker = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } }); // 公開キー＝攻撃者の手札

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
let passed = 0, failed = 0; const failures = [];
class AssertError extends Error {}
function assert(c, m) { if (!c) throw new AssertError(m); }
function eq(a, b, m) { assert(JSON.stringify(a) === JSON.stringify(b), `${m} — 期待:${JSON.stringify(b)} 実際:${JSON.stringify(a)}`); }
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ${C.g}✅ 防御OK${C.x}  ${name}`); }
  catch (e) { failed++; failures.push({ name, msg: e.message });
    console.log(`  ${C.r}❌ 突破された/失敗 ${C.x}  ${name}\n        ${C.r}${e.message}${C.x}`); }
}
function group(t) { console.log(`\n${C.b}${t}${C.x}`); }

const PREFIX = "ZZTEST_";
const participants = new Set();
function newP() { const id = randomUUID(); participants.add(id); return id; }

async function stampRaw(bodyObj) {
  const res = await fetch(`${API}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyObj) });
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, ...(j || {}) };
}
const stamp = (pid, spotToken, rewardId) => stampRaw({ participantId: pid, spotToken, rewardId });
async function cycleCount(pid, rewardId, cycle = 0) {
  const { count } = await db.from("stamps").select("*", { count: "exact", head: true }).eq("participant_id", pid).eq("reward_id", rewardId).eq("cycle", cycle);
  return count || 0;
}

const fx = { campaignId: null, s0: null, s1: null, card: null, coupon: null, victim: null, victimStampId: null, victimGrantId: null };
async function makeSpot(key) {
  const { data: src } = await db.from("spots").select("*").limit(1).single();
  const row = { ...src }; delete row.id; delete row.created_at;
  row.name_ja = PREFIX + key; row.name_en = PREFIX + key; row.token = randomUUID();
  row.active = true; row.owner_email = null; row.lat = null; row.lng = null; row.map_url = null;
  const { data, error } = await db.from("spots").insert(row).select("id, token").single();
  if (error) throw new Error("makeSpot: " + error.message); return data;
}
async function setup() {
  const { data: srcCamp } = await db.from("campaigns").select("*").limit(1).single();
  const camp = { ...srcCamp }; delete camp.id; delete camp.created_at; camp.active = false;
  if ("name" in camp) camp.name = PREFIX + "redteam"; if ("title_ja" in camp) camp.title_ja = PREFIX + "redteam";
  const { data: c } = await db.from("campaigns").insert(camp).select("id").single();
  fx.campaignId = c.id;
  fx.s0 = await makeSpot("s0"); fx.s1 = await makeSpot("s1");
  const { data: cp } = await db.from("coupons").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + "cpn", title_en: PREFIX + "cpn", active: true }).select("id").single();
  fx.coupon = cp.id;
  const { data: card } = await db.from("rewards").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + "card", title_en: PREFIX + "card", required_stamps: 2, recurring: false, active: true }).select("id").single();
  fx.card = card.id;
  await db.from("card_spots").insert([{ reward_id: fx.card, spot_id: fx.s0.id }, { reward_id: fx.card, spot_id: fx.s1.id }]);
  await db.from("card_coupons").insert({ reward_id: fx.card, coupon_id: fx.coupon });
  // 被害者の正規スタンプ＆クーポン付与（改ざん/削除の的）
  fx.victim = newP();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { data: st } = await db.from("stamps").insert({ participant_id: fx.victim, reward_id: fx.card, campaign_id: fx.campaignId, spot_id: fx.s0.id, cycle: 0, stamp_date: today, spot_name_ja: PREFIX + "s0", spot_name_en: PREFIX + "s0", spot_image_url: null }).select("id").single();
  fx.victimStampId = st.id;
  const { data: gr } = await db.from("coupon_grants").insert({ coupon_id: fx.coupon, participant_id: fx.victim, reward_id: fx.card, cycle: 0, expires_at: new Date(Date.now() + 60 * 86400e3).toISOString() }).select("id").single();
  fx.victimGrantId = gr.id;
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

// 匿名キーでの書き込みは全て失敗すべき。成功したら脆弱性。
async function anonWriteBlocked(promise, label) {
  const { data, error } = await promise;
  const wrote = !error && Array.isArray(data) && data.length > 0;
  assert(!wrote, `${label}: 匿名キーで書き込めてしまった（RLSの穴）`);
}

async function run() {
  group("A. トークン秘匿（推測・公開IDでは押せない）");
  await test("A1 ランダムなトークン20個 → すべて 404、1つも押せない", async () => {
    const p = newP();
    for (let i = 0; i < 20; i++) { const r = await stamp(p, randomUUID(), fx.card); eq(r.status, 404, "status"); }
    eq(await cycleCount(p, fx.card), 0, "0個");
  });
  await test("A2 スポットの“id”をトークンに使う（idは/api/rewardsで公開） → 404（idはトークンではない）", async () => {
    const p = newP();
    const r = await stamp(p, fx.s0.id, fx.card); // 公開されている spot.id を token として送る
    eq(r.status, 404, "status"); eq(r.error, "spot_not_found", "error");
    eq(await cycleCount(p, fx.card), 0, "0個");
  });
  await test("A3 実在トークンでも対象外カードに送れば not_target", async () => {
    // 別カード（この s0/s1 を対象にしない）を作る
    const { data: other } = await db.from("rewards").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + "other", title_en: PREFIX + "other", required_stamps: 1, recurring: false, active: true }).select("id").single();
    const p = newP();
    const r = await stamp(p, fx.s0.token, other.id);
    eq(r.not_target, true, "not_target");
    eq(await cycleCount(p, other.id), 0, "0個");
  });

  group("B. クライアント改ざんの無効化（サーバが権威）");
  await test("B1 cycle/stamp_date/店名を注入しても、保存はサーバ値（改ざん無視）", async () => {
    const p = newP();
    await stampRaw({ participantId: p, spotToken: fx.s0.token, rewardId: fx.card, cycle: 999, stamp_date: "2000-01-01", spot_name_ja: "HACKED", campaign_id: randomUUID() });
    const { data: row } = await db.from("stamps").select("cycle, stamp_date, spot_name_ja, campaign_id").eq("participant_id", p).eq("reward_id", fx.card).single();
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    eq(row.cycle, 0, "cycle はサーバ値0");
    eq(row.stamp_date, today, "stamp_date はサーバの今日");
    eq(row.spot_name_ja, PREFIX + "s0", "店名は実スポット名（注入無視）");
  });

  group("C. ★匿名キーでのDB直接改ざん（RLS）— すべて失敗すべき");
  await test("C1 stamps に直接INSERT（スタンプ自己付与）→ ブロック", async () => {
    const p = newP();
    const today = new Date().toISOString().slice(0, 10);
    await anonWriteBlocked(
      attacker.from("stamps").insert({ participant_id: p, reward_id: fx.card, campaign_id: fx.campaignId, spot_id: fx.s0.id, cycle: 0, stamp_date: today }).select("id"),
      "stamps INSERT");
    eq(await cycleCount(p, fx.card), 0, "実際に増えていない");
  });
  await test("C2 coupon_grants に直接INSERT（クーポン自己付与）→ ブロック", async () => {
    const p = newP();
    await anonWriteBlocked(
      attacker.from("coupon_grants").insert({ coupon_id: fx.coupon, participant_id: p, reward_id: fx.card, cycle: 0, expires_at: new Date(Date.now() + 86400e3).toISOString() }).select("id"),
      "coupon_grants INSERT");
    const { count } = await db.from("coupon_grants").select("*", { count: "exact", head: true }).eq("participant_id", p);
    eq(count || 0, 0, "付与されていない");
  });
  await test("C3 card_state に直接INSERT/UPDATE（サイクル操作）→ ブロック", async () => {
    const p = newP();
    await anonWriteBlocked(attacker.from("card_state").insert({ participant_id: p, reward_id: fx.card, completions: 99 }).select("participant_id"), "card_state INSERT");
  });
  await test("C4 他人の stamps を UPDATE/DELETE（改ざん・消去）→ ブロック", async () => {
    await anonWriteBlocked(attacker.from("stamps").update({ spot_name_ja: "TAMPERED" }).eq("id", fx.victimStampId).select("id"), "stamps UPDATE");
    await anonWriteBlocked(attacker.from("stamps").delete().eq("id", fx.victimStampId).select("id"), "stamps DELETE");
    const { data } = await db.from("stamps").select("spot_name_ja").eq("id", fx.victimStampId).single();
    eq(data.spot_name_ja, PREFIX + "s0", "被害者スタンプは無傷");
  });
  await test("C5 coupon_grants を UPDATE（使用済み解除/期限延長）→ ブロック", async () => {
    await anonWriteBlocked(attacker.from("coupon_grants").update({ redeemed_at: null, expires_at: new Date(Date.now() + 999 * 86400e3).toISOString() }).eq("id", fx.victimGrantId).select("id"), "coupon_grants UPDATE");
  });
  await test("C6 spots/rewards/card_spots に直接INSERT（偽スポット・偽対象追加）→ ブロック", async () => {
    await anonWriteBlocked(attacker.from("spots").insert({ name_ja: PREFIX + "evil", name_en: PREFIX + "evil", token: randomUUID(), active: true }).select("id"), "spots INSERT");
    await anonWriteBlocked(attacker.from("rewards").insert({ campaign_id: fx.campaignId, title_ja: PREFIX + "evil", required_stamps: 1, active: true }).select("id"), "rewards INSERT");
    await anonWriteBlocked(attacker.from("card_spots").insert({ reward_id: fx.card, spot_id: fx.s1.id }).select("reward_id"), "card_spots INSERT");
  });

  group("D. 重複・リプレイ攻撃");
  await test("D1 同一完了リクエストを50連打 → 規定枚数を超えない・クーポンは1枚", async () => {
    const p = newP();
    const seq = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? fx.s0.token : fx.s1.token));
    await Promise.all(seq.map((tk) => stamp(p, tk, fx.card)));
    eq(await cycleCount(p, fx.card), 2, "stamps=2（超過なし）");
    const { count } = await db.from("coupon_grants").select("*", { count: "exact", head: true }).eq("participant_id", p).eq("coupon_id", fx.coupon);
    eq(count || 0, 1, "grants=1");
  });
  await test("D2 完了後に何度リプレイしても増えない", async () => {
    const p = newP();
    await stamp(p, fx.s0.token, fx.card); await stamp(p, fx.s1.token, fx.card); // 完了
    for (let i = 0; i < 5; i++) await stamp(p, fx.s0.token, fx.card);
    eq(await cycleCount(p, fx.card), 2, "stamps=2");
    const { count } = await db.from("coupon_grants").select("*", { count: "exact", head: true }).eq("participant_id", p).eq("coupon_id", fx.coupon);
    eq(count || 0, 1, "grants=1");
  });

  // ---- E. 設計上の限界（情報表示）----
  group("E. 設計上の限界（情報・要認識）");
  const { count: gReadable } = await attacker.from("coupon_grants").select("*", { count: "exact", head: true });
  if (typeof gReadable === "number") {
    console.log(`  ${C.c}ℹ 情報${C.x}  coupon_grants は公開READ可（匿名でSELECT可）。他人の付与内容が読める設計です（不正取得ではないがプライバシー留意）。`);
    console.log(`         必要なら SELECT ポリシーを participant 限定に絞れます。`);
  }
  console.log(`  ${C.c}ℹ 情報${C.x}  QRトークンは物理QRの中身。第三者に写真で共有されると現地に行かず押せます（QR方式の本質的限界）。`);
  console.log(`         対策例: スポット側の時間帯限定トークン/短命コード、または現地GPS照合など（必要になれば設計します）。`);
}

(async () => {
  console.log(`${C.b}最終チェック: レッドチーム（スタンプ不正取得の総当たり）${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { console.log(`${C.d}隔離フィクスチャを準備中…${C.x}`); await setup(); await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストデータを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}防御OK: ${passed}${C.x}   ${failed ? C.r : C.d}突破/失敗: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}要対処:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

#!/usr/bin/env node
/**
 * 最終チェック — 機能⑧「管理APIのアクセス制御スイープ（最後の砦・セキュリティ）」
 * ---------------------------------------------------------------------------
 * 実行:  node scripts/test_admin_security.mjs
 *        (本番API。ローカルは API_BASE=http://localhost:3000 を指定)
 *
 * 目的: すべての /api/admin/* が、権限のない相手からの書き込みを確実に拒否するか
 *       （＝どこかのエンドポイントで管理者ガードを付け忘れていないか）を横断検査。
 *   - トークン無し / 非管理者トークン / 匿名参加者トークン の3通りで全メソッドを叩き、
 *     いずれも 401 で拒否されることを確認（2xx が返ったら重大な抜け）。
 *   - オーナーAPIが匿名参加者を弾くことも確認。
 *
 * 安全性: 送信ボディは空/ダミーのみ（正しくガードされていれば副作用ゼロ）。
 *         テスト用 auth ユーザーは最後に削除。実データには触れません。
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
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ${C.g}✅ PASS${C.x}  ${name}`); }
  catch (e) { failed++; failures.push({ name, msg: e.message });
    console.log(`  ${C.r}❌ ${e instanceof AssertError ? "FAIL" : "ERROR"}${C.x}  ${name}\n        ${C.r}${e.message}${C.x}`); }
}
function group(t) { console.log(`\n${C.b}${t}${C.x}`); }

const authUsers = new Set();
async function mintUser() {
  const email = `zztest.sec.${randomUUID().slice(0, 8)}@example.com`, password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  authUsers.add(created.user.id);
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new Error("signIn: " + (e2?.message || "no session"));
  return s.session.access_token;
}
async function mintAnon() {
  const { data, error } = await anon.auth.signInAnonymously();
  if (error || !data.session) throw new Error("anon signIn: " + (error?.message || "no session"));
  if (data.user?.id) authUsers.add(data.user.id);
  return data.session.access_token;
}

async function call(path, method, token) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  const bodyMethods = method === "POST" || method === "PATCH" || method === "PUT";
  if (bodyMethods) h["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { method, headers: h, body: bodyMethods ? "{}" : undefined });
  return res.status;
}

// 全 /api/admin/* エンドポイントと実装メソッド
const ADMIN_EPS = [
  ["/api/admin/backfill-coords", ["POST"]],
  ["/api/admin/coupons", ["GET", "POST", "PATCH", "DELETE"]],
  ["/api/admin/events", ["GET", "POST", "PATCH", "DELETE"]],
  ["/api/admin/owners", ["GET", "POST", "DELETE"]],
  ["/api/admin/reward", ["PATCH"]],
  ["/api/admin/rewards", ["GET", "POST", "PATCH", "DELETE"]],
  ["/api/admin/spots", ["GET", "POST", "DELETE", "PATCH"]],
  ["/api/admin/upload", ["POST"]],
];
const OWNER_EPS = ["/api/owner/spots", "/api/owner/events"];

async function run() {
  const strangerTok = await mintUser();
  const anonTok = await mintAnon();

  group("A. 管理API: トークン無しは全メソッド 401");
  for (const [ep, methods] of ADMIN_EPS) {
    for (const m of methods) {
      await test(`A ${m} ${ep} (no-token) → 401`, async () => {
        const s = await call(ep, m, null);
        assert(s === 401, `期待401 実際${s}`);
      });
    }
  }

  group("B. 管理API: 非管理者トークンは全メソッド 401（正規ログインでも権限外）");
  for (const [ep, methods] of ADMIN_EPS) {
    for (const m of methods) {
      await test(`B ${m} ${ep} (非管理者) → 401`, async () => {
        const s = await call(ep, m, strangerTok);
        assert(s === 401, `期待401 実際${s}`);
      });
    }
  }

  group("C. 管理API: 匿名参加者トークンは 401（参加者は管理不可）");
  for (const [ep, methods] of ADMIN_EPS) {
    // 代表として書き込み系1つ（POST か PATCH か DELETE、無ければ先頭）を検査
    const m = methods.find((x) => x !== "GET") || methods[0];
    await test(`C ${m} ${ep} (匿名) → 401`, async () => {
      const s = await call(ep, m, anonTok);
      assert(s === 401, `期待401 実際${s}`);
    });
  }

  group("D. オーナーAPI: 匿名参加者は 401（メール無しは弾く）");
  for (const ep of OWNER_EPS) {
    await test(`D GET ${ep} (匿名) → 401`, async () => {
      const s = await call(ep, "GET", anonTok);
      assert(s === 401, `期待401 実際${s}`);
    });
  }
  await test("D 参考: オーナーAPI POST も匿名は 401", async () => {
    const s = await call("/api/owner/events", "POST", anonTok);
    assert(s === 401, `期待401 実際${s}`);
  });
}

async function teardown() {
  for (const id of authUsers) { try { await db.auth.admin.deleteUser(id); } catch {} }
}

(async () => {
  console.log(`${C.b}最終チェック: 管理APIアクセス制御スイープ${C.x}  ${C.d}(API: ${API})${C.x}`);
  try { await run(); }
  catch (e) { console.error(`\n${C.r}致命的エラー: ${e.message}${C.x}`); failed++; }
  finally { console.log(`${C.d}\nテストユーザーを削除中…${C.x}`); await teardown(); }
  console.log(`\n${C.b}==================== 結果 ====================${C.x}`);
  console.log(`  ${C.g}PASS: ${passed}${C.x}   ${failed ? C.r : C.d}FAIL: ${failed}${C.x}`);
  if (failures.length) { console.log(`\n${C.r}失敗した項目:${C.x}`); for (const f of failures) console.log(`  - ${f.name}\n      ${f.msg}`); }
  console.log(`${C.b}=============================================${C.x}`);
  process.exit(failed ? 1 : 0);
})();

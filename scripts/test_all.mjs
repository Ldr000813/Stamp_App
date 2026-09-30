#!/usr/bin/env node
/**
 * 全テストを1コマンドで連続実行するランナー。
 * 実行:  node scripts/test_all.mjs      (または npm run test:all)
 *        ローカルへ向ける場合:  API_BASE=http://localhost:3000 node scripts/test_all.mjs
 *
 * 各スイートは独立（使い捨てデータ・自己完結）。1つ落ちても最後まで走らせ、
 * 末尾に総合サマリを表示します。全て緑なら終了コード0、1つでも失敗なら1。
 */
import { spawnSync } from "node:child_process";

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m" };

// 実行系スイート（本番/指定APIを叩く）
const API_SUITES = [
  ["スタンプ付与ロジック", "scripts/test_stamps.mjs"],
  ["クーポン（付与→使用→期限）", "scripts/test_coupons.mjs"],
  ["オーナー権限（アクセス制御）", "scripts/test_owners.mjs"],
  ["イベント表示ロジック", "scripts/test_events.mjs"],
  ["スタンプ保全＋管理セキュリティ", "scripts/test_preserve.mjs"],
  ["特典集計 /api/rewards", "scripts/test_rewards.mjs"],
  ["行き方リンク /api/go", "scripts/test_directions.mjs"],
  ["管理APIアクセス制御スイープ", "scripts/test_admin_security.mjs"],
];

const results = [];

for (const [name, path] of API_SUITES) {
  console.log(`\n${C.b}──────── ${name} ────────${C.x}`);
  const r = spawnSync(process.execPath, [path], { stdio: "inherit" });
  results.push([name, r.status === 0]);
}

// ユニットテスト（vitest）
console.log(`\n${C.b}──────── ユニットテスト (vitest) ────────${C.x}`);
const v = spawnSync("npm", ["test"], { stdio: "inherit", shell: true });
results.push(["ユニット (vitest)", v.status === 0]);

// 総合サマリ
console.log(`\n${C.b}==================== 総合サマリ ====================${C.x}`);
let allPass = true;
for (const [name, ok] of results) {
  console.log(`  ${ok ? C.g + "✅ PASS" : C.r + "❌ FAIL"}${C.x}  ${name}`);
  if (!ok) allPass = false;
}
const passN = results.filter((r) => r[1]).length;
console.log(`${C.b}---------------------------------------------------${C.x}`);
console.log(`  ${allPass ? C.g : C.y}${passN}/${results.length} スイート成功${C.x}`);
console.log(`${C.b}===================================================${C.x}`);
process.exit(allPass ? 0 : 1);

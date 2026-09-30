# テストガイド（最終チェック）

このプロジェクトの回帰テスト一覧と実行方法です。コア機能（スタンプの正確性・クーポンの期限と単一使用・権限分離・スタンプの絶対保全・地図ピン精度・管理APIのアクセス制御）を企業レベルで検証します。

## まとめて実行（推奨）

```bash
npm run test:all
```

全スイートを連続実行し、末尾に総合サマリを表示します。1つでも失敗すると終了コード1になります。
ローカルの開発サーバーに向ける場合:

```bash
# Windows (PowerShell)
$env:API_BASE="http://localhost:3000"; npm run test:all
# macOS / Linux
API_BASE=http://localhost:3000 npm run test:all
```

---

## 実行系スイート（本番/指定APIを叩く）

いずれも **使い捨てUUIDの参加者・`ZZTEST_` 接頭辞のフィクスチャ・一時認証ユーザー**のみを使い、実行後に自動で全削除します。既存の実データには触れません（テスト用キャンペーンは `active=false` で作るため、参加者画面には出ません）。

| コマンド | 対象 | 主な観点 |
|---|---|---|
| `npm run test:stamps` | スタンプ付与 `/api/stamp` | 入力検証／無効スポット・カード／対象外／ユーザー分離／同日重複防止／完走・クーポン付与（grant-once）／定期カードのサイクルリセット／日付境界／同時実行／データ保全 |
| `npm run test:coupons` | クーポン `/api/coupons`・`/redeem` | 一覧・expired フラグ／所有者チェック／正常使用／二重使用（冪等）／**期限切れ410で消費されない**／分岐優先順位／同時実行 |
| `npm run test:owners` | オーナー権限 `/api/owner/*`・`/api/admin/owners` | 認証必須／担当スポットのみ可視／他店舗の作成・更新・削除は403／管理APIは管理者専用／許可リスト追加削除の反映 |
| `npm run test:events` | イベント表示 `/api/events` | 終了フラグ／終了24hで非表示（境界）／表示ウィンドウ／active フィルタ／並び順／スポット詳細の絞り込み |
| `npm run test:preserve` | スポット管理＋スタンプ保全 | 管理APIは管理者専用／**スポット削除でもスタンプは消えない**（spot_id→NULL・スナップショット保持）／キャンペーン削除でも保持／参考: カード削除時の挙動 |
| `npm run test:rewards` | 特典集計 `/api/rewards` | レスポンス構造／target_spots 一致／進捗加算・他カード不変／ユーザー分離／unlocked 整合／サイクル切替 |
| `npm run test:directions` | 行き方リンク `/api/go` | 常に開けるURL・**goo.gl短縮を返さない**／座標・住所・名前フォールバック／異常系 |
| `npm run test:adminsec` | 管理APIアクセス制御スイープ | 全 `/api/admin/*` がトークン無し・非管理者・匿名参加者で **401** 拒否／オーナーAPIも匿名を拒否 |
| `npm run test:chaos` | カオス／ストレス（**わざと壊しにいく**） | 連打／同時スキャン／**完了レースのクーポン取りこぼし検出**／不正・悪意入力のクラッシュ耐性／多人数混在／クーポン乱打。競合を突くため環境により FAIL＝バグ検出（`test:all` には含めない） |

---

## ユニットテスト（vitest・ネットワーク不要）

```bash
npm test
```

| ファイル | 対象 |
|---|---|
| `tests/apiAuth.test.ts` | 権限判定ヘルパー |
| `tests/datetime.test.ts` | 日付・時刻処理 |
| `tests/mapurl.test.ts` | 座標抽出（基本） |
| `tests/mapurl_precision.test.ts` | 座標抽出の精密ケース（**@中心にずれる=亀岡ドリフト回帰テスト**、負座標・3桁経度・高精度・複数ピン・フォールバック） |
| `tests/rewards.test.ts` | 特典ロジック |

---

## 前提

- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` が必要（実行系スイートが使用）。
- Node.js 18 以上（グローバル `fetch` を使用）。
- Supabase の Authentication で「Email/Password」「Anonymous sign-ins」が有効であること（テスト用ユーザーの作成に使用）。

## 安全性メモ

- 実行系スイートは書き込みを伴いますが、全て隔離フィクスチャ＋使い捨て参加者で、`try/finally` により必ず後片付けします。
- `test:directions` と `test:events` は実行中の数秒だけテストデータが公開APIに現れる可能性があります（未ローンチ想定）。
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー専用の鍵です。テストはローカル実行専用とし、CI等に載せる場合は秘密として扱ってください。

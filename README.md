# デジタルスタンプラリー (Kyoto Stamp Rally)

京都で暮らす外国人が、店舗・イベント・文化施設等をQRで巡って
スタンプを集めるWebシステム（アプリ不要 / 日英対応 / 匿名参加）。

技術スタック: **Next.js (App Router, TS) + Supabase (Postgres) + Tailwind**
参加者は **匿名**（端末ごとのランダムID / 個人情報なし）。

---

## セットアップ手順

### 1. 依存インストール
```bash
npm install
```

### 2. Supabase プロジェクトを用意
1. https://supabase.com で無料プロジェクトを作成
2. **SQL Editor** に `supabase/schema.sql` を貼り付けて実行
   （テーブル・RLS・シードのキャンペーンが作られます）
3. **Project Settings → API** から以下を取得

### 3. 環境変数
`.env.example` を `.env.local` にコピーして値を入れる:
```
NEXT_PUBLIC_SUPABASE_URL=...          # Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # anon public key
SUPABASE_SERVICE_ROLE_KEY=...         # service_role key（サーバー専用・絶対に公開しない）
ADMIN_EMAILS=you@example.com          # /admin に入れる管理者メール（カンマ区切り）
```

### 4. 管理者ユーザーを作る
Supabase の **Authentication → Users → Add user** で、`ADMIN_EMAILS` に
入れたメール＋パスワードのユーザーを作成。

### 5. 起動
```bash
npm run dev
```
- 参加者トップ: http://localhost:3000
- 管理画面:     http://localhost:3000/admin

---

## 使い方
1. `/admin` にログイン → スポットを追加（自動で開催中キャンペーンに紐づく）
2. 各スポットの「QR発行」→ 表示されたQRを印刷して現地に設置
3. 参加者がスマホのカメラでQRを読む → `/stamp?spot=xxx` が開き、スタンプ獲得
4. トップで「3/5」などの進捗、達成でコンプリート表示
5. 管理画面「CSVエクスポート」でデータ書き出し

---

## アーキテクチャの要点
- **参加者は匿名**: `localStorage` のランダムUUID。個人情報を集めない＝個人情報保護法の負担を最小化。
- **スタンプの読み書きはサーバーAPI経由のみ**（service_role）。ブラウザから `stamps` テーブルは触れない（RLSで保護）。
- **重複防止**: `stamps` の `unique(participant_id, campaign_id, spot_id)` 制約。
- **CSV出力**: 管理画面から（要件対応）。

## まだ入っていない（次の拡張候補 / TODO）
- 管理画面での**キャンペーン作成・必要スタンプ数の編集**（今はSQLのシード1件。schemaにテーブルはある）
- **スポットの編集・削除・並び替え、有効/無効切替**
- **MAP表示**（Leaflet + OpenStreetMap。今は一覧表示のみ＝要件は満たす）
- **PWA化**（manifest + service worker）
- アプリ内**QRスキャナ**（`html5-qrcode`。今は端末カメラでURLを開く方式で十分動く）
- 無料枠運用時の**自動バックアップ**（pg_dump の定期実行）と**keep-alive ping**（停止回避）

## 本番前チェック
- Supabase を **Pro** にする（自動停止なし＋日次バックアップ）
- `SUPABASE_SERVICE_ROLE_KEY` は Vercel等の**サーバー環境変数**にのみ設定（クライアントに出さない）
- 独自ドメイン or meetup.kyoto サブドメイン

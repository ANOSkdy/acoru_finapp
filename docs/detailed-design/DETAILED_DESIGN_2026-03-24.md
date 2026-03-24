# 詳細設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: `ANOSkdy/acoru_finapp`
- 方針: 実装準拠（推測禁止）。未確認事項は明示。

## 1. モジュール構成（現行実装）

- `app/layout.tsx`
  - ルートレイアウト。`AppShell` を全ページへ適用。
- `app/components/AppShell.tsx`
  - ヘッダ/下部ナビ（`/recordlists`, `/upload`）。
- `app/recordlists/page.tsx`
  - 台帳一覧、検索、ページング、新規作成モーダル。
- `app/recordedit/page.tsx`
  - `/recordlists` へリダイレクト。
- `app/recordedit/[journalId]/page.tsx`
  - 台帳詳細表示、更新、削除。
- `app/upload/page.tsx`
  - ファイル選択、Blob アップロード、受付登録。
- `app/api/blob/upload/route.ts`
  - Blob トークン発行。
- `app/api/receipts/register/route.ts`
  - `receipt_queue` upsert。
- `app/api/ledger/route.ts`
  - 台帳一覧取得 + 新規作成。
- `app/api/ledger/[journalId]/route.ts`
  - 単票取得 + 部分更新 + 削除。
- `app/api/cron/process-receipts/route.ts`
  - キュー処理、Gemini 解析、台帳反映。
- `lib/env.ts`
  - 環境変数の Zod パース。
- `lib/db.ts`
  - Neon Pool singleton。
- `lib/cronLock.ts`
  - Cron ロック獲得/解放。
- `lib/receiptQueue.ts`
  - キュー予約・状態更新。
- `lib/gemini.ts`
  - 解析プロンプト + JSON レスポンス処理。
- `db/migrations/001_receipt_queue_and_cron_locks.sql`
  - `receipt_queue`, `cron_locks` DDL。

## 2. 画面詳細（現行実装）

### 2.1 layout / AppShell

- `layout.tsx`
  - `Geist`, `Geist_Mono` を適用。
  - `metadata.title = "Acoru_経費台帳"`。
- `AppShell.tsx`
  - `usePathname()` で active タブ切替。
  - ナビ項目は Record List / Upload の2つ。

### 2.2 `/recordlists`

- 一覧取得
  - `q`, `limit`, `offset` から query string を生成。
  - `GET /api/ledger` を `cache: "no-store"` で呼ぶ。
- 新規登録
  - モーダル入力を `POST /api/ledger` に送信。
  - 金額系は画面側で整数化。
- 画面責務
  - 検索、ページング、再読み込み、詳細画面遷移。

### 2.3 `/recordedit/[journalId]`

- 初期取得
  - `GET /api/ledger/{journalId}`。
- 更新
  - `PATCH /api/ledger/{journalId}`（部分更新）。
- 削除
  - `DELETE /api/ledger/{journalId}`。

### 2.4 `/upload`

- 入力許可
  - 拡張子 `.jpg,.jpeg,.png,.pdf`
  - MIME `image/jpeg`, `image/png`, `application/pdf`
- 1ファイルごとの処理
  1. UUID 採番（`receiptId`）
  2. `/api/blob/upload` 経由で Blob へアップロード
  3. `/api/receipts/register` で DB キュー登録
  4. 成否を UI に表示

## 3. API 詳細（現行実装）

### 3.1 `POST /api/blob/upload`

- 役割: Blob トークン発行
- 入力: `clientPayload.receiptId`（UUID 必須）
- 制約: MIME/最大サイズ（`MAX_FILE_BYTES`）

### 3.2 `POST /api/receipts/register`

- 役割: キュー登録
- 入力: `receiptId`, `blobUrl`, `pathname`, `fileName`, `mimeType`, `sizeBytes`
- バリデーション: Zod
- サイズ超過: 413

### 3.3 `GET /api/ledger`

- 役割: 台帳一覧
- 入力: `q`, `limit`, `offset`
- 実装: `ILIKE` 検索 + ページング + count/list 並列取得

### 3.4 `POST /api/ledger`

- 役割: 台帳作成
- 入力: 取引日/借方/貸方/摘要/メモ等
- 実装: `expense_ledger` INSERT、`processed_at = now()`

### 3.5 `GET /api/ledger/[journalId]`

- 役割: 単票取得
- 入力: 数値 `journalId`
- 未存在: 404

### 3.6 `PATCH /api/ledger/[journalId]`

- 役割: 部分更新
- 入力: 任意更新項目（strict）
- 実装: 受領項目のみ動的 `SET` 構築

### 3.7 `DELETE /api/ledger/[journalId]`

- 役割: 単票削除
- 入力: 数値 `journalId`

### 3.8 `GET /api/cron/process-receipts`

- 役割: キュー処理バッチ
- 認証: `Authorization: Bearer {CRON_SECRET}`
- 処理:
  1. Cron ロック獲得
  2. 対象キュー予約（`FOR UPDATE SKIP LOCKED`）
  3. Blob 取得 → Gemini 解析
  4. `expense_ledger` INSERT（トランザクション）
  5. 成功/失敗でキュー状態更新
  6. Cron ロック解放

## 4. データ詳細（現行実装）

### 4.1 `receipt_queue`（migration 確認済み）

- PK: `receipt_id (UUID)`
- 状態: `UNPROCESSED | PROCESSING | PROCESSED | ERROR`
- 補助列: エラー情報、再試行時刻、解析結果 JSONB
- インデックス:
  - `(status, next_retry_at)`
  - `(uploaded_at)`

### 4.2 `cron_locks`（migration 確認済み）

- PK: `lock_name`
- ロック管理: `locked_until`, `locked_by`, `locked_at`

### 4.3 `expense_ledger`（inferred-from-code）

- 現行実装では CRUD/INSERT の中心テーブル。
- ただし DDL は本リポジトリ上で未確認（not confirmed in this repository）。

## 5. 環境変数・ランタイム（現行実装）

- DB: `DATABASE_URL`
- Blob: `BLOB_READ_WRITE_TOKEN`
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`
- Cron: `CRON_SECRET`, `CRON_LOCK_TTL_SECONDS`
- 処理上限: `MAX_FILE_BYTES`, `MAX_FILES_PER_RUN`
- 既定勘定: `DEFAULT_CREDIT_ACCOUNT`
- API ランタイム: `runtime = "nodejs"`

注記: `NEON_DATABASE_URL` の利用は本リポジトリ上では未確認（not confirmed in this repository）。

## 6. エラー処理・セキュリティ（現行実装）

- 入力検証: Zod
- SQL: parameterized SQL
- 認証: Cron API の Bearer 認証
- シークレット露出:
  - env はサーバーコードで参照
  - クライアントバンドルへ機密値を渡す実装は未確認

## 7. 既知ギャップ（事実ベース）

- `expense_ledger` DDL: not confirmed in this repository
- 認証/認可全体設計: not confirmed in this repository
- テスト/CI 定義: not confirmed in this repository

## 8. 推奨拡張設計の検討事項（提案・未実装）

> 本章は proposed / not implemented。

### 8.1 将来マスタ/ドメイン候補

- `account_master`（勘定科目正規化）
- `reporting_periods`（会計期間・締め）
- 組織/ユーザー単位スコープ（現時点では not confirmed in this repository）

### 8.2 将来レポート API 候補

- `/api/reports/trial-balance`
- `/api/reports/pl`
- `/api/reports/bs`
- `/api/reports/cf`
- `/api/dashboard/summary`

### 8.3 将来 UI 候補

- `/dashboard`
- 月次 KPI カード
- 推移チャート
- キュー/処理状況ウィジェット

### 8.4 将来構造進化メモ

- 現行実装では `expense_ledger` 中心の単一レコード運用。
- 拡張案として、将来的に複合仕訳に対応する `journal` / `journal_lines` モデルへ進化させる余地がある（proposed / not implemented）。

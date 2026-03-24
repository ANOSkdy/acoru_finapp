# 詳細設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: `ANOSkdy/acoru_finapp`
- 方針: 実装準拠（推測禁止）。未確認項目は明示。

## 1. ディレクトリ/モジュール構成

- `app/layout.tsx`  
  - ルートレイアウト。`AppShell` を全ページに適用。
- `app/components/AppShell.tsx`  
  - クライアントコンポーネント。ヘッダと下部ナビ（`/recordlists`,`/upload`）。
- `app/recordlists/page.tsx`  
  - 一覧表示・検索・ページング・新規作成モーダル。
- `app/recordedit/page.tsx`  
  - 一覧へリダイレクト。
- `app/recordedit/[journalId]/page.tsx`  
  - 仕訳単票の編集/削除 UI。
- `app/upload/page.tsx`  
  - 複数ファイルアップロード UI。
- `app/api/**`  
  - Blob 受付、キュー登録、台帳 CRUD、Cron 処理。
- `lib/env.ts`  
  - 環境変数の Zod パース。
- `lib/db.ts`  
  - Neon Postgres `Pool` の singleton 管理。
- `lib/cronLock.ts`  
  - `cron_locks` を使ったロック獲得/解放。
- `lib/receiptQueue.ts`  
  - `receipt_queue` の upsert / reserve / 完了 / エラー更新。
- `lib/gemini.ts`  
  - Gemini への領収書解析依頼。
- `db/migrations/001_receipt_queue_and_cron_locks.sql`  
  - `receipt_queue` と `cron_locks` 定義。

## 2. 画面詳細設計

### 2.1 AppShell / layout

- `layout.tsx`
  - `Geist` / `Geist_Mono` フォントを適用。
  - `<AppShell>{children}</AppShell>` 構成。
- `AppShell.tsx`
  - `usePathname()` でアクティブタブ判定。
  - 下部ナビは `Record List` と `Upload` の2項目。

### 2.2 `/recordlists`

- 状態
  - `q`, `limit`, `offset`, `rows`, `total`, `loading`, `err`。
  - 新規作成用に `showCreateModal`, `draft`, `creating`, `createErr`。
- 一覧取得
  - `queryString`（q/limit/offset）変更で `load()` 実行。
  - `GET /api/ledger?{query}` を `cache: "no-store"` で呼ぶ。
- 検索/ページング
  - q 変更時 offset を 0 に戻す。
  - `canPrev/canNext` でページ移動可否を制御。
- 新規作成
  - `draft` の金額系は `toInt()` で整数化し `POST /api/ledger`。
  - 成功時モーダルを閉じ、一覧再読込。

### 2.3 `/recordedit/[journalId]`

- ルートパラメータ
  - `useParams` から `journalId` を取得。
- 読込
  - 初期表示時 `GET /api/ledger/{journalId}`。
  - 戻り値を画面用 `draft` に反映（null は空文字/0補正）。
- 保存
  - `PATCH /api/ledger/{journalId}`。
  - 金額系は `toInt()`。
  - 成功時ステータス表示。
- 削除
  - `confirm` 後、`DELETE /api/ledger/{journalId}`。
  - 成功時 `/recordlists` へ遷移。

### 2.4 `/upload`

- 入力
  - `accept=.jpg,.jpeg,.png,.pdf`、`multiple`。
  - MIME を `image/jpeg|image/png|application/pdf` で検証。
- 処理手順（ファイルごと）
  1. `receiptId = crypto.randomUUID()` 採番。  
  2. `upload()` で Blob へ送信（`handleUploadUrl=/api/blob/upload`）。  
  3. `POST /api/receipts/register` でキュー登録。  
  4. 成否を `results` に保持し表示。
- 補足
  - 不正 MIME は送信せず失敗結果として扱う。
  - `resetUpload()` で状態と input 値をクリア。

## 3. API 詳細設計

全 API 共通: `runtime = "nodejs"`、多くで `dynamic = "force-dynamic"`。

### 3.1 `GET /api/ledger`

- 入力
  - Query: `q?`, `limit(1..200, default 50)`, `offset(>=0, default 0)`。
- 処理
  - `q` あり: 複数列に `ILIKE` 検索。
  - `COUNT` と `SELECT` を `Promise.all` 並列実行。
- 出力
  - `{ ok, total, limit, offset, rows }`。
- 異常
  - 例外時 500。

### 3.2 `POST /api/ledger`

- 入力
  - 必須: `transaction_date`, `debit_account`, `credit_account` 等。
  - 数値: 金額/税額は nonnegative int。
- 処理
  - `transaction_date` を `normalizeDate`。
  - `expense_ledger` へ INSERT、`processed_at=now()`。
- 出力
  - 201 `{ ok: true, journal_id }`。
- 異常
  - ZodError: 400（Validation error）。
  - その他: 500。

### 3.3 `GET /api/ledger/[journalId]`

- 入力
  - Path: 数字のみ許可（`/^\d+$/`）。
- 処理
  - 1件 SELECT。
- 出力
  - 200 `{ ok: true, row }`。
- 異常
  - 不正ID: 400。
  - 未存在: 404。

### 3.4 `PATCH /api/ledger/[journalId]`

- 入力
  - Path: `journalId` 数字。
  - Body: 任意項目の部分更新（strict schema）。
- 処理
  - `req.text()` → JSON.parse（空文字許容）。
  - 受領項目だけ動的に `SET` を組立。
  - 更新時に `processed_at = now()` 付与。
- 出力
  - 200 `{ ok: true, row }`。
- 異常
  - JSON不正: 400。
  - 更新項目なし: 400。
  - 未存在: 404。

### 3.5 `DELETE /api/ledger/[journalId]`

- 入力
  - Path: `journalId` 数字。
- 処理
  - DELETE ... RETURNING。
- 出力
  - 200 `{ ok: true, journal_id }`。
- 異常
  - 不正ID: 400。
  - 未存在: 404。

### 3.6 `POST /api/blob/upload`

- 入力
  - Vercel Blob クライアント経由リクエスト。
  - `clientPayload.receiptId` を UUID 検証。
- 処理
  - `handleUpload` でトークンを生成。
  - 許可 MIME と最大サイズ（`MAX_FILE_BYTES`）を付与。
- 出力
  - `handleUpload` の JSON。
- 異常
  - 400 `{ ok:false, error }`。

### 3.7 `POST /api/receipts/register`

- 入力
  - `receiptId`, `blobUrl`, `pathname`, `fileName`, `mimeType`, `sizeBytes`。
- 処理
  - Zod 検証。
  - `sizeBytes > MAX_FILE_BYTES` なら 413。
  - `upsertReceiptQueue` 実行。
- 出力
  - 200 `{ ok:true, receiptId }`。
- 異常
  - 400（検証エラー等）。

### 3.8 `GET /api/cron/process-receipts`

- 入力
  - Header `Authorization: Bearer {CRON_SECRET}` 必須。
- 処理
  1. `acquireCronLock("process-receipts", ttl, lockedBy)`。  
  2. 取得失敗時は `{ ok:true, skipped:true, reason:"locked" }` を返却。  
  3. `reserveReceipts(MAX_FILES_PER_RUN)` で対象確保。  
  4. 各対象で Blob 取得→`analyzeReceipt`→DBトランザクションで `expense_ledger` INSERT。  
  5. 成功: `markProcessed`。失敗: `markError(..., 600)`。  
  6. 最後に `releaseCronLock` を必ず実行。
- 出力
  - 200 `{ ok:true, processed, failed }`。
- 異常
  - 認証失敗: 401。

## 4. ライブラリ責務

### 4.1 `env.ts`
- 環境変数の単一入口。
- 起動時に `EnvSchema.parse(process.env)` で fail-fast。

### 4.2 `db.ts`
- `Pool` を生成。
- 開発時は `globalThis.__pool` 再利用で多重生成抑止。

### 4.3 `cronLock.ts`
- `acquireCronLock`
  - `cron_locks` に UPSERT。
  - `locked_until < now()` の場合のみ更新成功。
- `releaseCronLock`
  - `locked_until = now()` に更新して解放。

### 4.4 `receiptQueue.ts`
- `upsertReceiptQueue`
  - `receipt_id` 競合時にファイル情報を更新。
- `reserveReceipts`
  - `UNPROCESSED/ERROR` かつ `next_retry_at <= now()` を `FOR UPDATE SKIP LOCKED` で確保。
  - `PROCESSING` 化して返却。
- `markProcessed`
  - `PROCESSED`, `processed_at`, `ledger_journal_id`, `gemini_response` を更新。
- `markError`
  - `ERROR`, `error_count+1`, `last_error_message`, `next_retry_at` を更新。

### 4.5 `gemini.ts`
- Gemini 入出力の境界。
- `responseSchema` で JSON フォーマットを指示。
- 返却テキストが空/JSON でない場合は例外。

## 5. DB 詳細

### 5.1 `receipt_queue`（migration確定）

- 主キー: `receipt_id (UUID)`。
- 制約:
  - `size_bytes >= 0`
  - `status IN ('UNPROCESSED','PROCESSING','PROCESSED','ERROR')`
- インデックス:
  - `receipt_queue_status_next_retry_idx (status, next_retry_at)`
  - `receipt_queue_uploaded_at_idx (uploaded_at)`

### 5.2 `cron_locks`（migration確定）

- 主キー: `lock_name`。
- カラム: `locked_until`, `locked_by`, `locked_at`。

### 5.3 `expense_ledger`（コードからの推定）

- migration が存在しないため、以下は推定（inferred-from-code）:
  - `journal_id`, `transaction_date`
  - 借方/貸方の科目・金額・税額・請求区分
  - `description`, `memo`
  - `drive_file_id`, `drive_file_name`, `drive_mime_type`
  - `created_at`, `processed_at`, `gemini_response`

## 6. エラーハンドリング/バリデーション

- 入力検証
  - Zod で query/body/path（形式）を検証。
- エラー応答
  - API は `jsonError` 形式または `{ ok:false, error }` を返す。
- ログ
  - サーバー側で `console.error` 実装あり。
  - 機密値（環境変数）を直接ログ出力する実装は未確認。

## 7. 運用フローと Cron ロック

- Cron 実行要求は `CRON_SECRET` で認証。
- 同時実行は `cron_locks` で抑止。
- ロック TTL は `CRON_LOCK_TTL_SECONDS`。
- 対象選定は DB ロック付き（`FOR UPDATE SKIP LOCKED`）で重複処理回避。
- 失敗時は `next_retry_at` により再実行待ち。

## 8. 既知ギャップ（事実ベース）

- `expense_ledger` の DDL は本リポジトリ上で未確認。
- 認証/認可の全体設計書は本リポジトリ上で未確認（Cron API のシークレット認証を除く）。
- Vercel Cron スケジュール定義ファイルは本リポジトリ上で未確認。
- README はテンプレート内容であり、現実装の一次情報としては不十分。

# 詳細設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: ANOSkdy/acoru_finapp
- 記載方針: 現行コードの事実を優先し、提案事項は最終章に分離する。

## 1. ディレクトリ / モジュール構成

- `app/layout.tsx`
  - ルートレイアウト。`AppShell` を全ページに適用。
- `app/components/AppShell.tsx`
  - 共通ヘッダ・下部ナビゲーション表示。
- `app/recordlists/page.tsx`
  - 一覧表示、検索、ソート、インライン編集、新規作成、複数削除。
- `app/recordedit/page.tsx`
  - `/recordlists` へのリダイレクト。
- `app/recordedit/[journalId]/page.tsx`
  - 単票編集と削除。
- `app/upload/page.tsx`
  - 複数ファイル選択、Blob アップロード、受付登録。
- `app/trial-balance/page.tsx`
  - Phase 2 の試算表画面。期間/科目検索で `GET /api/reports/trial-balance` を呼ぶ。
- `app/pl/page.tsx`
  - Phase 3 の損益計算書画面。期間/検索で `GET /api/reports/pl` を呼ぶ。
- `app/bs/page.tsx`
  - Phase 3 の貸借対照表画面。期末日/検索で `GET /api/reports/bs` を呼ぶ。
- `app/dashboard/page.tsx`
  - Phase 4 のダッシュボード画面。期間指定で `GET /api/dashboard/summary` を呼ぶ。
- `app/cf/page.tsx`
  - Phase 4 の簡易CF画面。期間/検索で `GET /api/reports/cf` を呼ぶ。
- `app/api/**`
  - ledger CRUD、blob upload、receipt register、cron 処理。
  - Phase 5: journals API（`/api/journals`, `/api/journals/[journalUuid]`）。
- `lib/env.ts`
  - 環境変数を Zod で検証して export。
- `lib/db.ts`
  - Neon `Pool` の singleton 管理。
- `lib/cronLock.ts`
  - `cron_locks` を使ったロック獲得・解放。
- `lib/receiptQueue.ts`
  - `receipt_queue` の upsert / reserve / mark。
- `lib/gemini.ts`
  - Gemini 呼び出しと JSON 応答パース。

## 2. 画面別挙動

### 2.1 `/recordlists`

- `GET /api/ledger` を `no-store` で取得。
- 検索語、ページング、ソート列・方向をクエリ化。
- セルのダブルクリックでインライン編集し、`PATCH /api/ledger/[journalId]` を呼ぶ。
- 新規行は `POST /api/ledger`、削除は `DELETE /api/ledger`（複数 ID）を呼ぶ。

### 2.2 `/recordedit/[journalId]`

- 初期表示で `GET /api/ledger/[journalId]` を呼ぶ。
- 保存時に `PATCH /api/ledger/[journalId]` を呼ぶ。
- 削除時に `DELETE /api/ledger/[journalId]` を呼び、一覧へ遷移。

### 2.3 `/upload`

- 許可 MIME: `image/jpeg`, `image/png`, `application/pdf`。
- クライアントで `@vercel/blob/client` の `upload` を使用。
- アップロード完了後に `POST /api/receipts/register` を呼ぶ。

## 3. API 別挙動

### 3.1 `POST /api/blob/upload`

- `clientPayload.receiptId` を UUID として検証。
- Vercel Blob のアップロードトークンを返却。
- `MAX_FILE_BYTES` と MIME 制限を適用。

### 3.2 `POST /api/receipts/register`

- body を Zod で検証。
- サイズ超過時は `413`。
- `upsertReceiptQueue` で `receipt_queue` に登録。

### 3.3 `GET /api/ledger`

- `q/limit/offset/sortBy/sortOrder` を検証。
- `expense_ledger` へ `ILIKE` 検索を実行。
- `COUNT` と一覧取得を並列実行して返却。

### 3.4 `POST /api/ledger`

- body を検証して `expense_ledger` に INSERT。
- `journal_id` を返却。

### 3.5 `DELETE /api/ledger`

- `journalIds` を検証し、`IN (...)` で複数削除。
- 実削除件数・ID を返却。

### 3.6 `GET /api/ledger/[journalId]`

- `journalId` の数値形式チェック。
- 1件取得し、未存在なら `404`。

### 3.7 `PATCH /api/ledger/[journalId]`

- JSON を strict 検証。
- 指定項目のみ動的 `SET` で更新。
- 更新対象が無い場合は `400`。

### 3.8 `DELETE /api/ledger/[journalId]`

- `journalId` を単票削除し、未存在は `404`。

### 3.9 `GET /api/cron/process-receipts`

- `Authorization: Bearer {CRON_SECRET}` を検証。
- `acquireCronLock` で排他確保。
- `reserveReceipts` で対象確保、Blob 取得、Gemini 解析。
- `expense_ledger` へ INSERT 後、`markProcessed`。
- 失敗時は `markError`。
- 最後に `releaseCronLock`。

### 3.10 `GET /api/reports/trial-balance`

- `from` / `to`（YYYY-MM-DD）を必須検証、`q` を任意検証。
- `expense_ledger` の借方/貸方を UNION 集計して当期借方/当期貸方を算出。
- `debit_account_code` / `credit_account_code` を優先し、未設定時は `account_master.account_name` でフォールバック照合。
- 科目未解決でも `mapping_status = unmapped` として行を返却。
- `normal_balance` を使って残高方向/金額を算出し、安定順序で返却。

### 3.11 `GET /api/reports/pl`

- `from` / `to`（YYYY-MM-DD）を必須検証、`q` を任意検証。
- `expense_ledger` を借方/貸方展開し、`account_master.account_type IN ('revenue','expense')` に限定して集計。
- `debit_account_code` / `credit_account_code` を優先し、未設定時は `account_master.account_name` でフォールバック照合。
- `account_fs_mappings` / `financial_statement_lines` があれば行コードで返却し、無い場合も科目単位で返却。

### 3.12 `GET /api/reports/bs`

- `from` / `to`（YYYY-MM-DD）を必須検証、`q` を任意検証。
- `expense_ledger.transaction_date <= to` で残高集計し、`account_master.account_type IN ('asset','liability','equity')` に限定。
- 科目コード優先・科目名フォールバックで科目解決。
- `account_fs_mappings` / `financial_statement_lines` が未設定でも、科目区分ベースで集計結果を返却。



### 3.13 `GET /api/dashboard/summary`

- `from` / `to`（YYYY-MM-DD）を必須検証。
- 売上・費用を `account_master.account_type` ベースで集計し、営業利益を算出。
- 現預金残高は `asset` 科目 + `cf_category` / 科目名（現金/預金/cash/bank）フォールバックで算出。
- `receipt_queue` の `UNPROCESSED` / `ERROR` / `PROCESSED` 件数を返却。

### 3.14 `GET /api/reports/cf`

- `from` / `to`（YYYY-MM-DD）を必須検証、`q` を任意検証。
- `expense_ledger` を借方/貸方展開し、`debit_account_code` / `credit_account_code` 優先で科目解決。
- コード未設定時は `account_master.account_name` 一致でフォールバック。
- `account_master.cf_category` を `operating/investing/financing/none` に正規化して簡易CFとして返却。

## 4. ライブラリ責務

- `lib/env.ts`: server-only 前提の環境変数の正規化。
- `lib/db.ts`: DB コネクション管理。
- `lib/cronLock.ts`: Cron 多重起動防止。
- `lib/receiptQueue.ts`: 受付キュー状態遷移。
- `lib/gemini.ts`: 領収書解析プロンプト実行と JSON 化。

## 5. DB 詳細

### 5.1 `receipt_queue`（migration 確認済み）

主な列:
- `receipt_id` (UUID, PK)
- `blob_url`, `pathname`, `file_name`, `mime_type`, `size_bytes`
- `status` (`UNPROCESSED`/`PROCESSING`/`PROCESSED`/`ERROR`)
- `error_count`, `last_error_message`, `next_retry_at`
- `uploaded_at`, `processing_started_at`, `processed_at`
- `gemini_response` (JSONB), `ledger_journal_id`

主な index:
- `(status, next_retry_at)`
- `(uploaded_at)`

### 5.2 `cron_locks`（migration 確認済み）

主な列:
- `lock_name` (PK)
- `locked_until`
- `locked_by`
- `locked_at`

### 5.3 `expense_ledger`（migration 確認済み）

現行コードから参照される列（inferred-from-code）:
- `journal_id`
- `transaction_date`
- `debit_account`, `debit_vendor`, `debit_amount`, `debit_tax`, `debit_invoice_category`
- `credit_account`, `credit_vendor`, `credit_amount`, `credit_tax`, `credit_invoice_category`
- `description`, `memo`
- `drive_file_id`, `drive_file_name`, `drive_mime_type`
- `gemini_response`
- `created_at`, `processed_at`

Phase 3 追加テーブル:
- `financial_statement_lines`
- `account_fs_mappings`
- `financial_statement_snapshots`

## 6. エラー処理

- バリデーションエラーは `400`（一部 `413` / `404` / `401` を使用）。
- API で例外時は `ok: false` 形式で返却。
- `PATCH` は不正 JSON を個別検知して `400` を返却。
- Cron 処理は1件失敗しても継続し、`receipt_queue` にエラー情報を反映。

## 7. 現行設計のギャップ

- `expense_ledger` の正式スキーマ定義が本リポジトリ上では未確認。
- auth/access control の全体設計は本リポジトリ上では未確認。
- tests/CI の定義は本リポジトリ上では未確認。

## 8. 推奨拡張設計観点（未実装）

> 以下はすべて拡張案としての proposed であり、現行実装には未実装。

- `account_master` / `fiscal_periods` は実装済み。
- `trial-balance` / `pl` / `bs` レポート API は実装済み。
- dashboard（KPI/キュー集計）と簡易CF（`cf_category` 集計）は Phase 4 として実装済み。
- 将来 migration ターゲットとして `journals` / `journal_lines` へ移行し、複合仕訳を扱える構造へ拡張する（未実装）。
- 予実・部門別管理・決算運用高度化は未実装。

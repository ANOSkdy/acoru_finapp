# 基本設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: `ANOSkdy/acoru_finapp`（リポジトリ実装ベース）
- 根拠優先順位: `package.json` → `app/**` / `app/api/**` → `lib/**` → `db/migrations/**` → `README.md`（補助）

## 1. システム概要と目的

本システムは、領収書ファイル（JPG/PNG/PDF）をアップロードし、キュー登録後に定期実行 API で AI 解析（Gemini）を行い、経費仕訳を `expense_ledger` に登録・一覧・編集する Next.js 16（App Router）アプリである。

トップページ（`/`）は `"/recordlists"` へリダイレクトするだけで、独自 UI は持たない。

## 2. 主なユーザーフロー

1. ユーザーが `/upload` で領収書ファイルを複数選択してアップロード。  
2. クライアントが `/api/blob/upload` で Vercel Blob へのアップロードトークン発行/アップロードを行う。  
3. クライアントが `/api/receipts/register` を呼び、`receipt_queue` に受付情報を upsert する。  
4. Vercel Cron 想定の `/api/cron/process-receipts`（Authorization 必須）がキューを予約し、Blob からファイル取得、Gemini 解析、`expense_ledger` へ INSERT する。  
5. 成功時は `receipt_queue` を PROCESSED に更新、失敗時は ERROR と再試行時刻を更新。  
6. ユーザーは `/recordlists` で一覧参照、`/recordedit/[journalId]` で更新/削除する。

## 3. アーキテクチャ概要

- フレームワーク: Next.js 16.1.1 + React 19 + TypeScript。  
- ルーティング: App Router（`app/`）。  
- 画面レイアウト: `app/layout.tsx` + `AppShell`。  
- DB: `@neondatabase/serverless` の `Pool` を用いた Postgres 接続（Primary DB は `DATABASE_URL`）。  
- ストレージ: Vercel Blob（クライアント SDK + サーバー側 `handleUpload`）。  
- AI: `@google/genai` による Gemini 解析。  
- バッチ実行: `/api/cron/process-receipts` + `cron_locks` テーブルで排他。

注記: `NEON_DATABASE_URL` はコード上で未使用（本リポジトリ上で未確認）。

## 4. 画面一覧と責務

- `/`  
  - `redirect("/recordlists")` のみ。
- `/recordlists`  
  - 台帳一覧取得（`GET /api/ledger`）、検索、ページング。  
  - 新規レコード作成モーダル（`POST /api/ledger`）。
- `/recordedit`  
  - `redirect("/recordlists")` のみ。
- `/recordedit/[journalId]`  
  - 1件取得（`GET /api/ledger/[journalId]`）。  
  - 更新（`PATCH /api/ledger/[journalId]`）。  
  - 削除（`DELETE /api/ledger/[journalId]`）。
- `/upload`  
  - 複数ファイル選択、MIME バリデーション。  
  - Blob アップロード後、受付 API へ登録。

## 5. API サーフェス概要

- `POST /api/blob/upload`  
  - Blob アップロードトークン発行。`receiptId`（UUID）を clientPayload から検証。
- `POST /api/receipts/register`  
  - 受領ファイル情報を `receipt_queue` へ upsert。サイズ上限チェックあり。
- `GET /api/ledger`  
  - `expense_ledger` 一覧（q/limit/offset）。
- `POST /api/ledger`  
  - `expense_ledger` 新規作成。
- `GET /api/ledger/[journalId]`  
  - 単票取得。
- `PATCH /api/ledger/[journalId]`  
  - 部分更新。
- `DELETE /api/ledger/[journalId]`  
  - 削除。
- `GET /api/cron/process-receipts`  
  - Cron 実行エンドポイント。キュー処理、AI 解析、仕訳登録。

## 6. データモデル概要

### 6.1 receipt_queue（migration 定義あり）

用途: アップロード領収書の処理待ち/処理状態管理。

主要カラム（抜粋）:
- `receipt_id` UUID PK
- `blob_url`, `pathname`, `file_name`, `mime_type`, `size_bytes`
- `status`（UNPROCESSED / PROCESSING / PROCESSED / ERROR）
- `error_count`, `last_error_message`, `next_retry_at`
- `uploaded_at`, `processing_started_at`, `processed_at`
- `gemini_response` JSONB
- `ledger_journal_id` BIGINT

主要インデックス:
- `(status, next_retry_at)`
- `(uploaded_at)`

### 6.2 cron_locks（migration 定義あり）

用途: Cron 多重実行の排他。

主要カラム:
- `lock_name` PK
- `locked_until`
- `locked_by`
- `locked_at`

### 6.3 expense_ledger（コードからの期待定義）

`expense_ledger` の migration は本リポジトリ上で未確認。以下は API 実装から参照される列の期待値（推定）:

- 主キー系: `journal_id`
- 日付/借方: `transaction_date`, `debit_account`, `debit_vendor`, `debit_amount`, `debit_tax`, `debit_invoice_category`
- 貸方: `credit_account`, `credit_vendor`, `credit_amount`, `credit_tax`, `credit_invoice_category`
- 摘要等: `description`, `memo`
- ファイル関連: `drive_file_id`, `drive_file_name`, `drive_mime_type`
- 監査/処理: `created_at`, `processed_at`
- AI 応答: `gemini_response`

## 7. 環境変数（lib/env.ts 基準）

必須/既定値:
- `DATABASE_URL`（必須）
- `BLOB_READ_WRITE_TOKEN`（必須）
- `GEMINI_API_KEY`（必須）
- `GEMINI_MODEL`（既定: `gemini-3-flash-preview`）
- `CRON_SECRET`（最小16文字）
- `MAX_FILE_BYTES`（既定: 10MB）
- `MAX_FILES_PER_RUN`（既定: 50）
- `DEFAULT_CREDIT_ACCOUNT`（既定: `普通預金`）
- `CRON_LOCK_TTL_SECONDS`（既定: 600）

注記:
- すべて server-only で参照される実装。
- `NEON_DATABASE_URL` は `env.ts` に定義されていない（本リポジトリ上で未確認）。

## 8. 非機能設計（実装で確認できる範囲）

- 入力検証: API で Zod を使用（body/query/UUID/数値範囲）。
- SQL 安全性: すべてプレースホルダ付き parameterized SQL。
- 再試行制御: `receipt_queue.next_retry_at` と `markError`（固定 600 秒）でリトライ。
- 排他制御: `cron_locks` + `acquireCronLock`（TTL 付き）。
- ページング: `GET /api/ledger` の `limit`（1..200）/`offset`。
- ランタイム: 各 API は `runtime = "nodejs"` を明示。

## 9. 未確認事項・明示的ギャップ

- `expense_ledger` の DDL/migration は本リポジトリ上で未確認。
- 認証/認可（ユーザーログイン、権限分離）は Cron API の Bearer チェック以外、実装上は未確認。
- Vercel 設定ファイル（`vercel.json`）や Cron 設定本体は本リポジトリ上で未確認。
- README は create-next-app テンプレート内容で、現行実装の一次情報源ではない。

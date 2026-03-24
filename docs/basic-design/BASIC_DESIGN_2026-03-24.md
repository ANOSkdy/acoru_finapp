# 基本設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: `ANOSkdy/acoru_finapp`（リポジトリ実装ベース）
- 根拠優先順位: `package.json` → `app/**` / `app/api/**` → `lib/**` → `db/migrations/**` → `README.md`（補助）

## 1. システム概要（現行実装）

現行実装では、領収書ファイル（JPG/PNG/PDF）をアップロードし、`receipt_queue` に登録後、Cron API で Gemini 解析して `expense_ledger` へ仕訳登録する。登録済み仕訳は一覧・編集・削除できる。

- フロント: Next.js App Router のクライアント画面（`/recordlists`, `/recordedit/[journalId]`, `/upload`）
- サーバー: Route Handler（Node.js runtime 明示）
- DB: Neon Postgres（`DATABASE_URL` を server-only env で使用）
- Blob: Vercel Blob
- AI: Gemini（`@google/genai`）

## 2. ユーザーフロー（現行実装）

1. `/upload` で領収書ファイルを選択し、`/api/blob/upload` で Blob アップロード。  
2. `/api/receipts/register` で `receipt_queue` に upsert。  
3. `/api/cron/process-receipts` がキューを予約し、Blob 読み出し→Gemini 解析→`expense_ledger` INSERT。  
4. 成功時は `receipt_queue` を `PROCESSED`、失敗時は `ERROR` + `next_retry_at` を更新。  
5. `/recordlists` で一覧確認し、`/recordedit/[journalId]` で更新/削除する。

## 3. アーキテクチャ（現行実装）

- フレームワーク: Next.js 16.1.1 / React 19 / TypeScript
- レイアウト: `app/layout.tsx` + `AppShell`
- DB 接続: `@neondatabase/serverless` の `Pool` singleton
- バッチ排他: `cron_locks` テーブル + `acquireCronLock`
- 入力検証: Zod
- SQL: parameterized SQL

補足:
- `NEON_DATABASE_URL` は本リポジトリ上では未使用（not confirmed in this repository）。
- README はテンプレート内容であり、実装一次情報ではない。

## 4. 画面一覧（現行実装）

- `/` : `/recordlists` へリダイレクト
- `/recordlists` : 検索・ページング・新規仕訳登録
- `/recordedit` : `/recordlists` へリダイレクト
- `/recordedit/[journalId]` : 仕訳詳細表示、更新、削除
- `/upload` : 複数ファイルアップロード、アップロード結果表示

## 5. API 概要（現行実装）

- `POST /api/blob/upload` : Blob アップロードトークン発行（UUID 検証）
- `POST /api/receipts/register` : 受付情報を `receipt_queue` へ upsert
- `GET /api/ledger` : 台帳一覧取得（q/limit/offset）
- `POST /api/ledger` : 仕訳新規作成
- `GET /api/ledger/[journalId]` : 仕訳1件取得
- `PATCH /api/ledger/[journalId]` : 仕訳部分更新
- `DELETE /api/ledger/[journalId]` : 仕訳削除
- `GET /api/cron/process-receipts` : キュー処理・解析・仕訳登録

## 6. データモデル概要（現行実装）

### 6.1 migration で確認できるテーブル

- `receipt_queue`
  - 処理状態（UNPROCESSED/PROCESSING/PROCESSED/ERROR）
  - リトライ情報（`error_count`, `last_error_message`, `next_retry_at`）
  - 解析結果格納（`gemini_response`）
- `cron_locks`
  - Cron 多重実行抑止

### 6.2 コード参照で確認できるテーブル

- `expense_ledger`
  - 現行実装では CRUD 対象として利用。
  - ただし DDL/migration は本リポジトリ上では未確認（not confirmed in this repository）。
  - 列構成は inferred-from-code。

## 7. 環境変数概要（現行実装）

`lib/env.ts` で server-only として参照される主な値:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `CRON_SECRET`
- `MAX_FILE_BYTES`, `MAX_FILES_PER_RUN`
- `DEFAULT_CREDIT_ACCOUNT`
- `CRON_LOCK_TTL_SECONDS`

## 8. 非機能概要（現行実装）

- バリデーション: Zod による query/body 検証
- SQL セーフティ: プレースホルダ利用
- リトライ制御: `next_retry_at` に基づく再処理
- 排他制御: `cron_locks` + TTL
- シークレット保護: クライアント側で env を直接参照する実装は未確認

## 9. 推奨拡張方向（提案・未実装）

> 以下は拡張案としてのロードマップ記述であり、現行実装には未実装。

### 9.1 なぜ現行台帳アプリを財務プラットフォームへ拡張できるか

現行実装では、すでに「証憑アップロード」「仕訳データ蓄積」「処理ステータス管理」の基盤があるため、科目体系と期間軸を整備することで試算表・財務諸表・ダッシュボードへ段階拡張しやすい。

### 9.2 将来の到達機能（提案）

- 試算表（Trial Balance）
- 財務諸表（PL/BS/CF）
- ダッシュボード（KPI・推移・処理状況）
- レビュー/管理ワークフロー（承認・差戻し等の運用設計）

### 9.3 拡張の基本原則（提案）

- 本書の追加内容は docs/roadmap のみで、実装変更は行わない。
- 高度レポートより先に、勘定科目正規化と期間定義を先行する。
- ダッシュボード強化は、試算表/PL/BS の算出基盤確立後に行う。

## 10. 未確認事項（明示）

- `expense_ledger` の DDL は not confirmed in this repository。
- 認証/認可の全体設計（ユーザー管理、権限制御）は not confirmed in this repository。
- CI/自動テスト運用は not confirmed in this repository。

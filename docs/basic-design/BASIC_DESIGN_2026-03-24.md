# 基本設計書（acoru_finapp）

- 作成日: 2026-03-24
- 対象: ANOSkdy/acoru_finapp
- 記載方針: 現行実装の事実を優先し、未確認事項は補完しない。

## 1. システム概要

現行実装では、領収書ファイルをアップロードし、キュー登録後に Cron 経由で Gemini 解析を行い、`expense_ledger` へ仕訳データを登録する構成になっている。

- フロントエンド: Next.js App Router（`/recordlists`, `/recordedit/[journalId]`, `/dashboard`, `/trial-balance`, `/pl`, `/bs`, `/cf`, `/upload`）
- API: Next.js Route Handler（`runtime = "nodejs"`）
- DB: Neon Postgres（`DATABASE_URL` をサーバー側で参照）
- Blob: Vercel Blob
- AI: Gemini（`@google/genai`）

## 2. 現行ユーザーフロー

1. `/upload` で JPG/PNG/PDF を選択し、`/api/blob/upload` でアップロードする。  
2. `/api/receipts/register` で `receipt_queue` に受付情報を登録する。  
3. `GET /api/cron/process-receipts` が `receipt_queue` を処理し、Blob 取得・Gemini 解析・`expense_ledger` 登録を実行する。  
4. 成功時はキューを `PROCESSED`、失敗時は `ERROR` と再試行情報を更新する。  
5. `/recordlists` と `/recordedit/[journalId]` で仕訳を参照・更新・削除する。

## 3. アーキテクチャ

- Next.js 16 / React 19 / TypeScript
- DB アクセスはサーバー側実装（Route Handler / lib）
- 入力検証は Zod
- SQL はプレースホルダを使った parameterized SQL
- Cron 多重実行は `cron_locks` による排他制御

補足:
- `DATABASE_URL` は確認できるが、`NEON_DATABASE_URL` の実利用は本リポジトリ上では未確認。

## 4. 画面一覧

- `/` : `/recordlists` へ遷移
- `/recordlists` : 仕訳一覧、検索、並び替え、インライン編集、新規作成、複数削除
- `/recordedit` : `/recordlists` へリダイレクト
- `/recordedit/[journalId]` : 単票編集・削除
- `/trial-balance` : 試算表の期間集計表示（Phase 2）
- `/pl` : 損益計算書（Phase 3）
- `/bs` : 貸借対照表（Phase 3）
- `/upload` : 複数ファイルアップロードと結果表示

## 5. API 概要

- `POST /api/blob/upload` : Blob アップロード用トークン発行
- `POST /api/receipts/register` : 受付情報を `receipt_queue` に upsert
- `GET /api/ledger` : 仕訳一覧取得（検索・ページング・ソート）
- `POST /api/ledger` : 仕訳作成
- `DELETE /api/ledger` : 複数仕訳削除
- `GET /api/ledger/[journalId]` : 仕訳単票取得
- `PATCH /api/ledger/[journalId]` : 仕訳部分更新
- `DELETE /api/ledger/[journalId]` : 仕訳単票削除
- `GET /api/cron/process-receipts` : キュー処理（認証付き）
- `GET /api/reports/trial-balance` : 期間指定で試算表を取得（Phase 2）
- `GET /api/reports/pl` : 期間指定で損益計算書を取得（Phase 3）
- `GET /api/reports/bs` : 期末日指定で貸借対照表を取得（Phase 3）
- `GET /api/dashboard/summary` : KPI/運用サマリを取得（Phase 4）
- `GET /api/reports/cf` : `cf_category` ベースの簡易CFを取得（Phase 4）

## 6. データモデル概要

### 6.1 migration で確認できるテーブル

- `receipt_queue`
  - 領収書受付、処理状態、エラー再試行、Gemini 応答保存
- `cron_locks`
  - Cron 排他用ロック

### 6.2 コードから参照されるテーブル

- `expense_ledger`
  - 現行実装で CRUD と解析結果登録の対象
  - Phase 1 で勘定科目コード/会計期間への参照列を追加済み
- `account_master` / `fiscal_periods`
  - Phase 1 の会計基盤テーブル
- `trial_balance_snapshots`
  - Phase 2 で追加された試算表スナップショット基盤（現時点は保存処理未実装）
- `ledger_account_mapping_audit`
  - Phase 2 で追加された科目マッピング監査ログ基盤
- `financial_statement_lines` / `account_fs_mappings` / `financial_statement_snapshots`
  - Phase 3 で追加された PL/BS（将来 CF を含む）帳票定義・科目マッピング・スナップショット基盤

## 7. 環境変数

`lib/env.ts` で参照される主な変数:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `CRON_SECRET`
- `MAX_FILE_BYTES`
- `MAX_FILES_PER_RUN`
- `DEFAULT_CREDIT_ACCOUNT`
- `CRON_LOCK_TTL_SECONDS`

## 8. 非機能概要

- バリデーション: Zod で request を検証
- セキュリティ: 機密値はサーバー側 env 前提
- 可用性: `receipt_queue` の再試行制御（`next_retry_at`）
- 同時実行制御: `cron_locks` による排他
- 実行基盤: DB を使う API は `runtime = "nodejs"`

## 9. 現行の制約・ギャップ

- `expense_ledger` の migration/DDL が確認できないため、制約・インデックスの正式情報は本リポジトリ上では未確認。
- 認証/認可（ユーザー単位アクセス制御）の実装は本リポジトリ上では未確認。
- tests/CI の整備状況は本リポジトリ上では未確認。

## 10. 推奨拡張方針

### 10.1 現行実装

- 現行実装では、証憑アップロード・AI 解析・経費台帳 CRUD までが実装済み。
- 現行実装では、単一テーブル中心の台帳運用を継続しつつ、Phase 2 で試算表 API/画面を追加済み。
- 現行実装では、Phase 3 として PL/BS API と画面を追加済み。
- Phase 4 として Dashboard API/画面と簡易CF API/画面を最小構成で実装済み。
- 複合仕訳移行は Phase 5 最小実装済み。
- Phase 6 として `departments` / `projects` / `budgets` / `closing_runs` / `audit_logs` を加算実装し、予算管理・締め処理ログの最小 API/画面を追加済み。
- auth/承認ワークフローの高度化は引き続き未実装。

### 10.2 将来の拡張案

- 拡張案として、会計基盤整備（勘定科目体系・会計期間）を先行する。
- 拡張案として、試算表を先に安定化し、PL / BS 算出へ接続する。
- 拡張案として、Dashboard / KPI を追加し、運用モニタリングを強化する。
- 拡張案として、複合仕訳対応（複数明細）に移行可能なモデルへ段階的に進化させる。
- 拡張案として、最終的な財務基盤化（帳票・分析・運用の一体化）を目標にする。

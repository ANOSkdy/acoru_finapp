require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ddl = `
BEGIN;

CREATE TABLE IF NOT EXISTS expense_ledger (
  journal_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_date DATE NOT NULL,

  debit_account TEXT NOT NULL,
  debit_vendor TEXT,
  debit_amount BIGINT NOT NULL DEFAULT 0,
  debit_tax BIGINT NOT NULL DEFAULT 0,
  debit_invoice_category TEXT NOT NULL DEFAULT '区分記載',

  credit_account TEXT NOT NULL,
  credit_vendor TEXT NOT NULL DEFAULT '',
  credit_amount BIGINT NOT NULL DEFAULT 0,
  credit_tax BIGINT NOT NULL DEFAULT 0,
  credit_invoice_category TEXT NOT NULL DEFAULT '区分記載',

  description TEXT,
  memo TEXT,

  drive_file_id TEXT UNIQUE,
  drive_file_name TEXT,
  drive_mime_type TEXT,

  gemini_response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_processing_errors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id UUID,
  file_name TEXT,
  error_message TEXT NOT NULL,
  stack TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW expense_ledger_jp AS
SELECT
  journal_id              AS "仕訳ID",
  transaction_date        AS "取引日",
  debit_account           AS "借方勘定科目",
  debit_vendor            AS "借方取引先",
  debit_amount            AS "借方金額",
  debit_tax               AS "仮払消費税",
  debit_invoice_category  AS "借方インボイス区分",
  credit_account          AS "貸方勘定科目",
  credit_vendor           AS "貸方取引先",
  credit_amount           AS "貸方金額",
  credit_tax              AS "仮受消費税",
  credit_invoice_category AS "貸方インボイス区分",
  description             AS "摘要",
  memo                    AS "メモ"
FROM expense_ledger;

COMMIT;
`;

(async () => {
  await pool.query(ddl);
  console.log("✅ Applied: expense_ledger, receipt_processing_errors, expense_ledger_jp");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());

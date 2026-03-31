CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS journals (
  journal_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number BIGSERIAL UNIQUE,
  transaction_date DATE NOT NULL,
  description TEXT,
  memo TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','receipt_ai','import','adjustment','closing')),
  source_receipt_id UUID,
  source_file_name TEXT,
  source_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  journal_line_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_uuid UUID NOT NULL REFERENCES journals(journal_uuid) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  account_code TEXT NOT NULL REFERENCES account_master(account_code),
  vendor_name TEXT,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  invoice_category TEXT NOT NULL DEFAULT '区分記載',
  line_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journal_uuid, line_no)
);

CREATE INDEX IF NOT EXISTS idx_journals_transaction_date_number
  ON journals (transaction_date, journal_number);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_uuid_line_no
  ON journal_lines (journal_uuid, line_no);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code_side
  ON journal_lines (account_code, side);

ALTER TABLE expense_ledger
  ADD COLUMN IF NOT EXISTS journal_uuid UUID REFERENCES journals(journal_uuid);

ALTER TABLE receipt_queue
  ADD COLUMN IF NOT EXISTS journal_uuid UUID REFERENCES journals(journal_uuid);

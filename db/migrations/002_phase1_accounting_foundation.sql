CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS expense_ledger (
  journal_id BIGSERIAL PRIMARY KEY,
  transaction_date DATE NOT NULL,
  debit_account TEXT NOT NULL,
  debit_vendor TEXT,
  debit_amount INTEGER NOT NULL CHECK (debit_amount >= 0),
  debit_tax INTEGER NOT NULL DEFAULT 0 CHECK (debit_tax >= 0),
  debit_invoice_category TEXT NOT NULL DEFAULT '区分記載',
  credit_account TEXT NOT NULL,
  credit_vendor TEXT,
  credit_amount INTEGER NOT NULL CHECK (credit_amount >= 0),
  credit_tax INTEGER NOT NULL DEFAULT 0 CHECK (credit_tax >= 0),
  credit_invoice_category TEXT NOT NULL DEFAULT '区分記載',
  description TEXT,
  memo TEXT,
  drive_file_id TEXT,
  drive_file_name TEXT,
  drive_mime_type TEXT,
  gemini_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS expense_ledger_transaction_date_idx
  ON expense_ledger (transaction_date);

CREATE INDEX IF NOT EXISTS expense_ledger_created_at_desc_idx
  ON expense_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS expense_ledger_drive_file_id_idx
  ON expense_ledger (drive_file_id);

CREATE TABLE IF NOT EXISTS account_master (
  account_code TEXT PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  account_subtype TEXT,
  fs_section TEXT NOT NULL CHECK (fs_section IN ('BS','PL','CF','OFF')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_master_type_active_sort_idx
  ON account_master (account_type, is_active, sort_order);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  period_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','closed','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, period_name),
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS fiscal_periods_status_dates_idx
  ON fiscal_periods (status, start_date, end_date);

ALTER TABLE expense_ledger
  ADD COLUMN IF NOT EXISTS debit_account_code TEXT,
  ADD COLUMN IF NOT EXISTS credit_account_code TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_period_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expense_ledger_debit_account_code_fkey'
  ) THEN
    ALTER TABLE expense_ledger
      ADD CONSTRAINT expense_ledger_debit_account_code_fkey
      FOREIGN KEY (debit_account_code)
      REFERENCES account_master(account_code)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expense_ledger_credit_account_code_fkey'
  ) THEN
    ALTER TABLE expense_ledger
      ADD CONSTRAINT expense_ledger_credit_account_code_fkey
      FOREIGN KEY (credit_account_code)
      REFERENCES account_master(account_code)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expense_ledger_fiscal_period_id_fkey'
  ) THEN
    ALTER TABLE expense_ledger
      ADD CONSTRAINT expense_ledger_fiscal_period_id_fkey
      FOREIGN KEY (fiscal_period_id)
      REFERENCES fiscal_periods(period_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expense_ledger_debit_account_code_idx
  ON expense_ledger (debit_account_code);

CREATE INDEX IF NOT EXISTS expense_ledger_credit_account_code_idx
  ON expense_ledger (credit_account_code);

CREATE INDEX IF NOT EXISTS expense_ledger_fiscal_period_id_idx
  ON expense_ledger (fiscal_period_id);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trial_balance_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(period_id),
  account_code TEXT NOT NULL REFERENCES account_master(account_code),
  opening_debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  opening_credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  period_debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  period_credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_period_id, account_code)
);

CREATE INDEX IF NOT EXISTS trial_balance_snapshots_period_account_idx
  ON trial_balance_snapshots (fiscal_period_id, account_code);

CREATE TABLE IF NOT EXISTS ledger_account_mapping_audit (
  mapping_audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id BIGINT NOT NULL REFERENCES expense_ledger(journal_id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
  raw_account_name TEXT NOT NULL,
  mapped_account_code TEXT REFERENCES account_master(account_code),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('mapped', 'unmapped', 'manual_override')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_account_mapping_audit_journal_side_idx
  ON ledger_account_mapping_audit (journal_id, side);

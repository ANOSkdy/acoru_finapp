CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dashboard_kpi_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(period_id),
  revenue_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  operating_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  unprocessed_receipt_count INTEGER NOT NULL DEFAULT 0,
  error_receipt_count INTEGER NOT NULL DEFAULT 0,
  processed_receipt_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_period_id)
);

CREATE TABLE IF NOT EXISTS dashboard_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_events_type_created_at_desc_idx
  ON dashboard_events (event_type, created_at DESC);

ALTER TABLE account_master
  ADD COLUMN IF NOT EXISTS cf_category TEXT
  CHECK (cf_category IN ('operating','investing','financing','none'));

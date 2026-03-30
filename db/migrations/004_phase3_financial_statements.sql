CREATE TABLE IF NOT EXISTS financial_statement_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('PL','BS','CF')),
  line_code TEXT NOT NULL,
  line_name TEXT NOT NULL,
  parent_line_code TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  sign_policy TEXT NOT NULL DEFAULT 'normal' CHECK (sign_policy IN ('normal','invert')),
  is_total_line BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (statement_type, line_code)
);

CREATE INDEX IF NOT EXISTS financial_statement_lines_statement_order_idx
  ON financial_statement_lines (statement_type, display_order, line_code);

CREATE TABLE IF NOT EXISTS account_fs_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT NOT NULL REFERENCES account_master(account_code),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('PL','BS','CF')),
  line_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_code, statement_type),
  FOREIGN KEY (statement_type, line_code)
    REFERENCES financial_statement_lines(statement_type, line_code)
);

CREATE INDEX IF NOT EXISTS account_fs_mappings_statement_line_idx
  ON account_fs_mappings (statement_type, line_code);

CREATE TABLE IF NOT EXISTS financial_statement_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(period_id),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('PL','BS','CF')),
  snapshot_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_period_id, statement_type)
);

CREATE INDEX IF NOT EXISTS financial_statement_snapshots_generated_idx
  ON financial_statement_snapshots (generated_at DESC);

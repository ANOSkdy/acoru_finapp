CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code TEXT NOT NULL UNIQUE,
  department_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  budget_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(period_id),
  account_code TEXT NOT NULL REFERENCES account_master(account_code),
  department_id UUID REFERENCES departments(department_id),
  project_id UUID REFERENCES projects(project_id),
  budget_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_period_id, account_code, department_id, project_id)
);

ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(project_id);

CREATE TABLE IF NOT EXISTS closing_runs (
  closing_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(period_id),
  run_status TEXT NOT NULL CHECK (run_status IN ('started','completed','failed','rolled_back')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  action_type TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budgets_fiscal_period_account_idx
  ON budgets (fiscal_period_id, account_code);

CREATE INDEX IF NOT EXISTS closing_runs_period_created_desc_idx
  ON closing_runs (fiscal_period_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_target_created_desc_idx
  ON audit_logs (target_table, target_id, created_at DESC);

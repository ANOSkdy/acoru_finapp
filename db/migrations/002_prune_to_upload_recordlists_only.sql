-- Destructive cleanup for the reduced acoru_finapp scope.
-- Target scope after PR #24: keep only /upload and /recordlists.
--
-- Keep these tables:
--   - expense_ledger      : used by /api/ledger and receipt-processing Cron
--   - receipt_queue       : used by /upload registration and receipt-processing Cron
--   - cron_locks          : used by receipt-processing Cron locking
--
-- Drop these unused feature tables:
--   - financial reports / account master: account_master, financial_statement_lines,
--     account_fs_mappings, financial_statement_snapshots
--   - compound journals: journals, journal_lines
--   - budget / closing / dimensions: budgets, departments, projects, fiscal_periods, closing_runs
--   - audit-only support for removed master APIs: audit_logs
--
-- Before running in Production:
--   1. Take a Neon backup / restore point.
--   2. Deploy the app change that removes references to the tables below.
--   3. Run the pre-flight SELECT and review non-zero row counts.
--   4. Run the DROP transaction only after confirming the data is no longer needed.

-- Pre-flight: confirm which candidate tables exist and approximate row counts.
SELECT
  c.table_name,
  to_regclass('public.' || c.table_name) AS relation,
  COALESCE(s.n_live_tup, 0) AS estimated_rows
FROM (
  VALUES
    ('account_fs_mappings'),
    ('financial_statement_snapshots'),
    ('financial_statement_lines'),
    ('budgets'),
    ('closing_runs'),
    ('journal_lines'),
    ('journals'),
    ('departments'),
    ('projects'),
    ('fiscal_periods'),
    ('account_master'),
    ('audit_logs')
) AS c(table_name)
LEFT JOIN pg_stat_user_tables s
  ON s.relname = c.table_name
ORDER BY c.table_name;

-- Destructive section.
BEGIN;

-- Drop child/dependent tables before parent/master tables where possible.
DROP TABLE IF EXISTS account_fs_mappings;
DROP TABLE IF EXISTS financial_statement_snapshots;
DROP TABLE IF EXISTS financial_statement_lines;

DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS closing_runs;

DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journals;

DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS fiscal_periods;
DROP TABLE IF EXISTS account_master;
DROP TABLE IF EXISTS audit_logs;

-- Remove now-unused optional journal linkage columns if they exist.
ALTER TABLE IF EXISTS expense_ledger DROP COLUMN IF EXISTS journal_uuid;
ALTER TABLE IF EXISTS receipt_queue DROP COLUMN IF EXISTS journal_uuid;

COMMIT;

-- Post-check: only required tables for the reduced app scope should remain from this set.
SELECT
  c.table_name,
  to_regclass('public.' || c.table_name) AS relation
FROM (
  VALUES
    ('expense_ledger'),
    ('receipt_queue'),
    ('cron_locks'),
    ('account_fs_mappings'),
    ('financial_statement_snapshots'),
    ('financial_statement_lines'),
    ('budgets'),
    ('closing_runs'),
    ('journal_lines'),
    ('journals'),
    ('departments'),
    ('projects'),
    ('fiscal_periods'),
    ('account_master'),
    ('audit_logs')
) AS c(table_name)
ORDER BY c.table_name;

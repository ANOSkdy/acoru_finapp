CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS receipt_queue (
  receipt_id            UUID PRIMARY KEY,
  blob_url              TEXT NOT NULL,
  pathname              TEXT NOT NULL,
  file_name             TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  size_bytes            INTEGER NOT NULL CHECK (size_bytes >= 0),

  status                TEXT NOT NULL CHECK (status IN ('UNPROCESSED','PROCESSING','PROCESSED','ERROR')),
  error_count           INTEGER NOT NULL DEFAULT 0,
  last_error_message    TEXT,
  next_retry_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,

  gemini_response       JSONB,
  ledger_journal_id     BIGINT
);

CREATE INDEX IF NOT EXISTS receipt_queue_status_next_retry_idx
  ON receipt_queue (status, next_retry_at);

CREATE INDEX IF NOT EXISTS receipt_queue_uploaded_at_idx
  ON receipt_queue (uploaded_at);

CREATE TABLE IF NOT EXISTS cron_locks (
  lock_name    TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  locked_by    TEXT NOT NULL,
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

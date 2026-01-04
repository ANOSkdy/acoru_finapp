import { pool } from "./db";

export type ReceiptRow = {
  receipt_id: string;
  blob_url: string;
  pathname: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "UNPROCESSED" | "PROCESSING" | "PROCESSED" | "ERROR";
  error_count: number;
  last_error_message: string | null;
  next_retry_at: string;
  uploaded_at: string;
};

export async function upsertReceiptQueue(input: {
  receiptId: string;
  blobUrl: string;
  pathname: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const sql = `
    INSERT INTO receipt_queue (
      receipt_id, blob_url, pathname, file_name, mime_type, size_bytes,
      status, next_retry_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      'UNPROCESSED', now()
    )
    ON CONFLICT (receipt_id) DO UPDATE
      SET blob_url = EXCLUDED.blob_url,
          pathname = EXCLUDED.pathname,
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes
    RETURNING receipt_id;
  `;
  await pool.query(sql, [
    input.receiptId,
    input.blobUrl,
    input.pathname,
    input.fileName,
    input.mimeType,
    input.sizeBytes,
  ]);
}

export async function reserveReceipts(limit: number): Promise<ReceiptRow[]> {
  const sql = `
    WITH cte AS (
      SELECT receipt_id
      FROM receipt_queue
      WHERE status IN ('UNPROCESSED','ERROR')
        AND next_retry_at <= now()
      ORDER BY uploaded_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE receipt_queue q
    SET status = 'PROCESSING',
        processing_started_at = now()
    FROM cte
    WHERE q.receipt_id = cte.receipt_id
    RETURNING
      q.receipt_id, q.blob_url, q.pathname, q.file_name, q.mime_type, q.size_bytes,
      q.status, q.error_count, q.last_error_message, q.next_retry_at, q.uploaded_at;
  `;
  const r = await pool.query<ReceiptRow>(sql, [limit]);
  return r.rows;
}

export async function markProcessed(receiptId: string, journalId: number, geminiResponse: unknown) {
  await pool.query(
    `UPDATE receipt_queue
     SET status='PROCESSED', processed_at=now(), ledger_journal_id=$2, gemini_response=$3
     WHERE receipt_id=$1`,
    [receiptId, journalId, geminiResponse]
  );
}

export async function markError(receiptId: string, message: string, nextRetryAtSeconds: number) {
  await pool.query(
    `UPDATE receipt_queue
     SET status='ERROR',
         error_count = error_count + 1,
         last_error_message = $2,
         next_retry_at = now() + ($3 || ' seconds')::interval
     WHERE receipt_id=$1`,
    [receiptId, message, nextRetryAtSeconds]
  );
}

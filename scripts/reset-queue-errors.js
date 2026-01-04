require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await pool.query(`
    UPDATE receipt_queue
    SET status='UNPROCESSED',
        next_retry_at=now(),
        last_error_message=NULL
    WHERE status='ERROR'
    RETURNING receipt_id, file_name, status, error_count;
  `);
  console.table(r.rows);
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => pool.end());

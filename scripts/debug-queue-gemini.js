require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await pool.query(`
    SELECT
      receipt_id,
      status,
      file_name,
      gemini_response->>'suggested_debit_account' AS suggested_debit_account,
      gemini_response->>'items_summary' AS items_summary,
      gemini_response->>'store_name' AS store_name,
      gemini_response->>'description' AS description
    FROM receipt_queue
    ORDER BY uploaded_at DESC
    LIMIT 5;
  `);
  console.table(r.rows);
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => pool.end());

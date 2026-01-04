require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Make sure .env.local exists and includes DATABASE_URL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
SELECT
  receipt_id, status, file_name, error_count, last_error_message, processed_at,
  (gemini_response->>'suggested_debit_account') AS suggested_debit_account
FROM receipt_queue
ORDER BY uploaded_at DESC
LIMIT 5;
`;

pool.query(sql)
  .then((r) => { console.table(r.rows); })
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());

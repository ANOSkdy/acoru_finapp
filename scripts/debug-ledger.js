require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await pool.query(`
    SELECT journal_id, transaction_date, debit_account, debit_vendor, debit_amount, drive_file_id, created_at
    FROM expense_ledger
    ORDER BY created_at DESC
    LIMIT 10;
  `);
  console.table(r.rows);
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => pool.end());

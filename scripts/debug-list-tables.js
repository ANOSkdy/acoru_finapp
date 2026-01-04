require("dotenv").config({ path: ".env.local" });
const { Pool } = require("@neondatabase/serverless");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type='BASE TABLE'
      AND table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name;
  `);
  console.table(r.rows);
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => pool.end());

import { pool } from "./db";

export async function acquireCronLock(lockName: string, ttlSeconds: number, lockedBy: string) {
  const sql = `
    WITH upsert AS (
      INSERT INTO cron_locks(lock_name, locked_until, locked_by)
      VALUES ($1, now() + ($2 || ' seconds')::interval, $3)
      ON CONFLICT (lock_name) DO UPDATE
        SET locked_until = EXCLUDED.locked_until,
            locked_by = EXCLUDED.locked_by,
            locked_at = now()
      WHERE cron_locks.locked_until < now()
      RETURNING 1
    )
    SELECT COUNT(*)::int AS acquired FROM upsert;
  `;
  const r = await pool.query<{ acquired: number }>(sql, [lockName, ttlSeconds, lockedBy]);
  return r.rows[0]?.acquired === 1;
}

export async function releaseCronLock(lockName: string, lockedBy: string) {
  await pool.query(
    `UPDATE cron_locks SET locked_until = now(), locked_by = $2, locked_at = now() WHERE lock_name = $1`,
    [lockName, lockedBy]
  );
}

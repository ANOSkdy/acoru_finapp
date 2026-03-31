import { PoolClient } from "@neondatabase/serverless";

export async function insertAuditLog(
  client: PoolClient,
  input: {
    actionType: string;
    targetTable: string;
    targetId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }
) {
  await client.query(
    `INSERT INTO audit_logs (
      actor_type,
      action_type,
      target_table,
      target_id,
      before_data,
      after_data
    ) VALUES ('system', $1, $2, $3, $4, $5);`,
    [
      input.actionType,
      input.targetTable,
      input.targetId,
      input.beforeData ?? null,
      input.afterData ?? null,
    ]
  );
}

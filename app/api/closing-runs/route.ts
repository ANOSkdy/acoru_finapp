import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  fiscal_period_id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  fiscal_period_id: z.string().uuid(),
  run_status: z.enum(["started", "completed", "failed", "rolled_back"]),
  notes: z.string().optional(),
  completed_at: z.string().datetime().optional(),
});

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse({
      fiscal_period_id: url.searchParams.get("fiscal_period_id") ?? undefined,
    });

    const values: string[] = [];
    let where = "";
    if (parsed.fiscal_period_id) {
      values.push(parsed.fiscal_period_id);
      where = "WHERE fiscal_period_id = $1";
    }

    const r = await pool.query(
      `SELECT closing_run_id, fiscal_period_id, run_status, notes, created_at, completed_at
       FROM closing_runs
       ${where}
       ORDER BY created_at DESC;`,
      values
    );

    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: Request) {
  const client = await pool.connect();
  try {
    const body = CreateSchema.parse(await req.json());
    await client.query("BEGIN");

    const completedAt = body.completed_at
      ? body.completed_at
      : body.run_status === "completed" || body.run_status === "failed" || body.run_status === "rolled_back"
        ? new Date().toISOString()
        : null;

    const r = await client.query(
      `INSERT INTO closing_runs (
         fiscal_period_id, run_status, notes, completed_at
       ) VALUES ($1, $2, $3, $4)
       RETURNING closing_run_id, fiscal_period_id, run_status, notes, created_at, completed_at;`,
      [body.fiscal_period_id, body.run_status, body.notes ?? null, completedAt]
    );
    const row = r.rows[0];

    await insertAuditLog(client, {
      actionType: "create",
      targetTable: "closing_runs",
      targetId: row.closing_run_id,
      afterData: row,
    });
    await client.query("COMMIT");

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  } finally {
    client.release();
  }
}

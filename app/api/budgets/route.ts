import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  fiscal_period_id: z.string().uuid(),
  account_code: z.string().optional(),
  department_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  fiscal_period_id: z.string().uuid(),
  account_code: z.string().min(1),
  department_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  budget_amount: z.coerce.number().default(0),
});

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse({
      fiscal_period_id: url.searchParams.get("fiscal_period_id"),
      account_code: url.searchParams.get("account_code") ?? undefined,
      department_id: url.searchParams.get("department_id") ?? undefined,
      project_id: url.searchParams.get("project_id") ?? undefined,
    });

    const values: Array<string> = [parsed.fiscal_period_id];
    let idx = 2;
    const where = ["b.fiscal_period_id = $1"];

    if (parsed.account_code) {
      where.push(`b.account_code = $${idx++}`);
      values.push(parsed.account_code);
    }
    if (parsed.department_id) {
      where.push(`b.department_id = $${idx++}`);
      values.push(parsed.department_id);
    }
    if (parsed.project_id) {
      where.push(`b.project_id = $${idx++}`);
      values.push(parsed.project_id);
    }

    const r = await pool.query(
      `SELECT
         b.budget_id,
         b.fiscal_period_id,
         b.account_code,
         b.department_id,
         d.department_code,
         d.department_name,
         b.project_id,
         p.project_code,
         p.project_name,
         b.budget_amount,
         b.created_at
       FROM budgets b
       LEFT JOIN departments d ON d.department_id = b.department_id
       LEFT JOIN projects p ON p.project_id = b.project_id
       WHERE ${where.join(" AND ")}
       ORDER BY b.account_code, d.department_code NULLS FIRST, p.project_code NULLS FIRST;`,
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
    const r = await client.query(
      `INSERT INTO budgets (
         fiscal_period_id, account_code, department_id, project_id, budget_amount
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING budget_id, fiscal_period_id, account_code, department_id, project_id, budget_amount, created_at;`,
      [
        body.fiscal_period_id,
        body.account_code,
        body.department_id ?? null,
        body.project_id ?? null,
        body.budget_amount,
      ]
    );
    const row = r.rows[0];

    await insertAuditLog(client, {
      actionType: "create",
      targetTable: "budgets",
      targetId: row.budget_id,
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

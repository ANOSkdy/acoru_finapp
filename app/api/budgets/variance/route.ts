import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  fiscal_period_id: z.string().uuid(),
});

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse({
      fiscal_period_id: url.searchParams.get("fiscal_period_id"),
    });

    const colCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'journal_lines' AND column_name = 'department_id'
      ) AS exists;`
    );
    const hasDims = Boolean(colCheck.rows[0]?.exists);

    const actualSql = hasDims
      ? `SELECT
           jl.account_code,
           jl.department_id,
           jl.project_id,
           SUM(CASE WHEN jl.side = 'debit' THEN jl.amount ELSE -jl.amount END)::numeric(18,2) AS actual_amount
         FROM journal_lines jl
         JOIN journals j ON j.journal_uuid = jl.journal_uuid
         JOIN fiscal_periods fp ON fp.period_id = $1
         WHERE j.transaction_date BETWEEN fp.start_date AND fp.end_date
         GROUP BY jl.account_code, jl.department_id, jl.project_id`
      : `SELECT
           COALESCE(e.debit_account_code, e.credit_account_code) AS account_code,
           NULL::uuid AS department_id,
           NULL::uuid AS project_id,
           SUM((COALESCE(e.debit_amount, 0) - COALESCE(e.credit_amount, 0))::numeric(18,2)) AS actual_amount
         FROM expense_ledger e
         JOIN fiscal_periods fp ON fp.period_id = $1
         WHERE e.transaction_date BETWEEN fp.start_date AND fp.end_date
         GROUP BY COALESCE(e.debit_account_code, e.credit_account_code)`;

    const r = await pool.query(
      `WITH budget_rows AS (
        SELECT budget_id, fiscal_period_id, account_code, department_id, project_id, budget_amount
        FROM budgets
        WHERE fiscal_period_id = $1
      ), actual_rows AS (
        ${actualSql}
      )
      SELECT
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
        COALESCE(a.actual_amount, 0)::numeric(18,2) AS actual_amount,
        (b.budget_amount - COALESCE(a.actual_amount, 0))::numeric(18,2) AS variance_amount,
        ${hasDims ? `'journal_lines'` : `'expense_ledger_fallback'`}::text AS actual_source
      FROM budget_rows b
      LEFT JOIN actual_rows a
        ON a.account_code = b.account_code
       AND a.department_id IS NOT DISTINCT FROM b.department_id
       AND a.project_id IS NOT DISTINCT FROM b.project_id
      LEFT JOIN departments d ON d.department_id = b.department_id
      LEFT JOIN projects p ON p.project_id = b.project_id
      ORDER BY b.account_code, d.department_code NULLS FIRST, p.project_code NULLS FIRST;`,
      [parsed.fiscal_period_id]
    );

    return NextResponse.json({ ok: true, rows: r.rows, actual_source: hasDims ? "journal_lines" : "expense_ledger" });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

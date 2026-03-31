import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.from <= v.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    const kpiResult = await pool.query(
      `WITH entries AS (
         SELECT
           'debit'::text AS side,
           e.debit_account_code AS account_code,
           e.debit_account AS raw_account_name,
           e.debit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date BETWEEN $1::date AND $2::date
         UNION ALL
         SELECT
           'credit'::text AS side,
           e.credit_account_code AS account_code,
           e.credit_account AS raw_account_name,
           e.credit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date BETWEEN $1::date AND $2::date
       ), resolved AS (
         SELECT
           en.side,
           en.amount,
           COALESCE(am_by_code.account_type, am_by_name.account_type) AS account_type,
           COALESCE(am_by_code.account_name, am_by_name.account_name, en.raw_account_name) AS account_name,
           COALESCE(am_by_code.cf_category, am_by_name.cf_category, 'none') AS cf_category
         FROM entries en
         LEFT JOIN account_master am_by_code
           ON en.account_code IS NOT NULL
          AND am_by_code.account_code = en.account_code
         LEFT JOIN account_master am_by_name
           ON en.account_code IS NULL
          AND am_by_name.account_name = en.raw_account_name
       )
       SELECT
         COALESCE(SUM(
           CASE
             WHEN account_type = 'revenue' THEN CASE WHEN side = 'credit' THEN amount ELSE -amount END
             ELSE 0
           END
         ), 0)::numeric(18,2) AS revenue_total,
         COALESCE(SUM(
           CASE
             WHEN account_type = 'expense' THEN CASE WHEN side = 'debit' THEN amount ELSE -amount END
             ELSE 0
           END
         ), 0)::numeric(18,2) AS expense_total,
         COALESCE(SUM(
           CASE
             WHEN account_type = 'asset' AND (cf_category IN ('operating','investing','financing') OR account_name ILIKE '%現金%' OR account_name ILIKE '%預金%' OR account_name ILIKE '%cash%' OR account_name ILIKE '%bank%')
             THEN CASE WHEN side = 'debit' THEN amount ELSE -amount END
             ELSE 0
           END
         ), 0)::numeric(18,2) AS cash_balance
       FROM resolved`,
      [parsed.from, parsed.to]
    );

    const queueResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'UNPROCESSED')::int AS unprocessed_receipt_count,
         COUNT(*) FILTER (WHERE status = 'ERROR')::int AS error_receipt_count,
         COUNT(*) FILTER (WHERE status = 'PROCESSED')::int AS processed_receipt_count
       FROM receipt_queue`
    );

    const revenueTotal = Number(kpiResult.rows[0]?.revenue_total ?? 0);
    const expenseTotal = Number(kpiResult.rows[0]?.expense_total ?? 0);

    return NextResponse.json({
      ok: true,
      from: parsed.from,
      to: parsed.to,
      kpis: {
        revenue_total: revenueTotal,
        expense_total: expenseTotal,
        operating_profit: revenueTotal - expenseTotal,
        cash_balance: Number(kpiResult.rows[0]?.cash_balance ?? 0),
      },
      queue: {
        unprocessed_receipt_count: Number(queueResult.rows[0]?.unprocessed_receipt_count ?? 0),
        error_receipt_count: Number(queueResult.rows[0]?.error_receipt_count ?? 0),
        processed_receipt_count: Number(queueResult.rows[0]?.processed_receipt_count ?? 0),
      },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    q: z.string().optional(),
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
      q: url.searchParams.get("q") ?? undefined,
    });

    const query = parsed.q?.trim() ? `%${parsed.q.trim()}%` : null;

    const result = await pool.query(
      `WITH entries AS (
         SELECT
           e.journal_id,
           'debit'::text AS side,
           e.debit_account_code AS account_code,
           e.debit_account AS raw_account_name,
           e.debit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date BETWEEN $1::date AND $2::date
         UNION ALL
         SELECT
           e.journal_id,
           'credit'::text AS side,
           e.credit_account_code AS account_code,
           e.credit_account AS raw_account_name,
           e.credit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date BETWEEN $1::date AND $2::date
       ), resolved AS (
         SELECT
           en.journal_id,
           en.side,
           en.amount,
           COALESCE(am_by_code.account_code, am_by_name.account_code) AS resolved_account_code,
           COALESCE(am_by_code.account_name, am_by_name.account_name, en.raw_account_name) AS resolved_account_name,
           COALESCE(am_by_code.normal_balance, am_by_name.normal_balance) AS normal_balance
         FROM entries en
         LEFT JOIN account_master am_by_code
           ON en.account_code IS NOT NULL
          AND am_by_code.account_code = en.account_code
         LEFT JOIN account_master am_by_name
           ON en.account_code IS NULL
          AND am_by_name.account_name = en.raw_account_name
       ), aggregated AS (
         SELECT
           r.resolved_account_code AS account_code,
           r.resolved_account_name AS account_name,
           CASE WHEN r.resolved_account_code IS NULL THEN 'unmapped' ELSE 'mapped' END AS mapping_status,
           SUM(CASE WHEN r.side = 'debit' THEN r.amount ELSE 0 END)::numeric(18,2) AS period_debit,
           SUM(CASE WHEN r.side = 'credit' THEN r.amount ELSE 0 END)::numeric(18,2) AS period_credit,
           MIN(r.normal_balance) AS normal_balance
         FROM resolved r
         WHERE $3::text IS NULL
            OR r.resolved_account_name ILIKE $3
            OR COALESCE(r.resolved_account_code, '') ILIKE $3
         GROUP BY r.resolved_account_code, r.resolved_account_name
       )
       SELECT
         a.account_code,
         a.account_name,
         a.period_debit,
         a.period_credit,
         CASE
           WHEN a.normal_balance = 'credit' THEN
             CASE WHEN a.period_credit - a.period_debit >= 0 THEN 'credit' ELSE 'debit' END
           WHEN a.normal_balance = 'debit' THEN
             CASE WHEN a.period_debit - a.period_credit >= 0 THEN 'debit' ELSE 'credit' END
           ELSE
             CASE WHEN a.period_debit - a.period_credit >= 0 THEN 'debit' ELSE 'credit' END
         END AS balance_side,
         CASE
           WHEN a.normal_balance = 'credit' THEN ABS(a.period_credit - a.period_debit)
           WHEN a.normal_balance = 'debit' THEN ABS(a.period_debit - a.period_credit)
           ELSE ABS(a.period_debit - a.period_credit)
         END::numeric(18,2) AS balance_amount,
         a.mapping_status
       FROM aggregated a
       ORDER BY
         CASE WHEN a.account_code IS NULL THEN 1 ELSE 0 END,
         a.account_code NULLS LAST,
         a.account_name ASC`,
      [parsed.from, parsed.to, query]
    );

    return NextResponse.json({
      ok: true,
      from: parsed.from,
      to: parsed.to,
      rows: result.rows,
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}

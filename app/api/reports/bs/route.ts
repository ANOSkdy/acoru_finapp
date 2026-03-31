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
           'debit'::text AS side,
           e.debit_account_code AS account_code,
           e.debit_account AS raw_account_name,
           e.debit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date <= $2::date
         UNION ALL
         SELECT
           'credit'::text AS side,
           e.credit_account_code AS account_code,
           e.credit_account AS raw_account_name,
           e.credit_amount::numeric(18,2) AS amount
         FROM expense_ledger e
         WHERE e.transaction_date <= $2::date
       ), resolved AS (
         SELECT
           en.side,
           en.amount,
           COALESCE(am_by_code.account_code, am_by_name.account_code) AS account_code,
           COALESCE(am_by_code.account_name, am_by_name.account_name, en.raw_account_name) AS account_name,
           COALESCE(am_by_code.account_type, am_by_name.account_type) AS account_type
         FROM entries en
         LEFT JOIN account_master am_by_code
           ON en.account_code IS NOT NULL
          AND am_by_code.account_code = en.account_code
         LEFT JOIN account_master am_by_name
           ON en.account_code IS NULL
          AND am_by_name.account_name = en.raw_account_name
       ), eligible AS (
         SELECT *
         FROM resolved
         WHERE account_type IN ('asset','liability','equity')
       ), mapped AS (
         SELECT
           e.account_code,
           e.account_name,
           e.account_type,
           CASE
             WHEN e.account_type = 'asset' THEN CASE WHEN e.side = 'debit' THEN e.amount ELSE -e.amount END
             WHEN e.account_type IN ('liability', 'equity') THEN CASE WHEN e.side = 'credit' THEN e.amount ELSE -e.amount END
             ELSE 0
           END AS signed_amount,
           m.line_code,
           fsl.line_name,
           fsl.display_order,
           CASE
             WHEN e.account_type = 'asset' THEN 'debit'
             WHEN e.account_type IN ('liability','equity') THEN 'credit'
             ELSE NULL
           END AS balance_side,
           'BS'::text AS statement_type,
           CASE WHEN m.mapping_id IS NULL THEN 'unmapped' ELSE 'mapped' END AS mapping_status
         FROM eligible e
         LEFT JOIN account_fs_mappings m
           ON m.account_code = e.account_code
          AND m.statement_type = 'BS'
         LEFT JOIN financial_statement_lines fsl
           ON fsl.statement_type = m.statement_type
          AND fsl.line_code = m.line_code
       )
       SELECT
         mapped.line_code,
         COALESCE(
           mapped.line_name,
           CASE
             WHEN mapped.account_type = 'asset' THEN '資産'
             WHEN mapped.account_type = 'liability' THEN '負債'
             ELSE '純資産'
           END
         ) AS line_name,
         mapped.account_code,
         mapped.account_name,
         SUM(mapped.signed_amount)::numeric(18,2) AS amount,
         mapped.balance_side,
         mapped.statement_type,
         mapped.mapping_status
       FROM mapped
       WHERE
         $3::text IS NULL
         OR mapped.account_name ILIKE $3
         OR COALESCE(mapped.account_code, '') ILIKE $3
         OR COALESCE(mapped.line_name, '') ILIKE $3
         OR COALESCE(mapped.line_code, '') ILIKE $3
       GROUP BY
         mapped.line_code,
         COALESCE(
           mapped.line_name,
           CASE
             WHEN mapped.account_type = 'asset' THEN '資産'
             WHEN mapped.account_type = 'liability' THEN '負債'
             ELSE '純資産'
           END
         ),
         mapped.account_code,
         mapped.account_name,
         mapped.balance_side,
         mapped.statement_type,
         mapped.mapping_status,
         mapped.account_type,
         COALESCE(mapped.display_order, 999999)
       ORDER BY
         CASE mapped.account_type WHEN 'asset' THEN 0 WHEN 'liability' THEN 1 WHEN 'equity' THEN 2 ELSE 3 END,
         COALESCE(mapped.display_order, 999999),
         mapped.account_name ASC`,
      [parsed.from, parsed.to, query]
    );

    return NextResponse.json({
      ok: true,
      from: parsed.from,
      to: parsed.to,
      rows: result.rows,
      summary: {
        rowCount: result.rows.length,
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

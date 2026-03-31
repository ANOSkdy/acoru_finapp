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
           COALESCE(am_by_code.account_code, am_by_name.account_code) AS account_code,
           COALESCE(am_by_code.account_name, am_by_name.account_name, en.raw_account_name) AS account_name,
           COALESCE(am_by_code.account_type, am_by_name.account_type) AS account_type,
           COALESCE(am_by_code.cf_category, am_by_name.cf_category, 'none') AS cf_category
         FROM entries en
         LEFT JOIN account_master am_by_code
           ON en.account_code IS NOT NULL
          AND am_by_code.account_code = en.account_code
         LEFT JOIN account_master am_by_name
           ON en.account_code IS NULL
          AND am_by_name.account_name = en.raw_account_name
       ), normalized AS (
         SELECT
           CASE WHEN cf_category IN ('operating','investing','financing') THEN cf_category ELSE 'none' END AS cf_category,
           account_code,
           account_name,
           CASE
             WHEN account_type = 'asset' THEN CASE WHEN side = 'debit' THEN amount ELSE -amount END
             WHEN account_type IN ('liability', 'equity', 'revenue') THEN CASE WHEN side = 'credit' THEN amount ELSE -amount END
             WHEN account_type = 'expense' THEN CASE WHEN side = 'debit' THEN amount ELSE -amount END
             ELSE CASE WHEN side = 'credit' THEN amount ELSE -amount END
           END AS movement_amount
         FROM resolved
       )
       SELECT
         n.cf_category,
         n.account_code,
         n.account_name,
         SUM(n.movement_amount)::numeric(18,2) AS amount
       FROM normalized n
       WHERE $3::text IS NULL
          OR n.account_name ILIKE $3
          OR COALESCE(n.account_code, '') ILIKE $3
          OR n.cf_category ILIKE $3
       GROUP BY n.cf_category, n.account_code, n.account_name
       ORDER BY
         CASE n.cf_category WHEN 'operating' THEN 0 WHEN 'investing' THEN 1 WHEN 'financing' THEN 2 ELSE 3 END,
         n.account_code NULLS LAST,
         n.account_name ASC`,
      [parsed.from, parsed.to, query]
    );

    const summary = result.rows.reduce(
      (acc, row) => {
        const category = row.cf_category ?? "none";
        const amount = Number(row.amount ?? 0);
        acc.total += amount;
        acc.by_category[category] = (acc.by_category[category] ?? 0) + amount;
        return acc;
      },
      {
        total: 0,
        by_category: {
          operating: 0,
          investing: 0,
          financing: 0,
          none: 0,
        } as Record<string, number>,
      }
    );

    return NextResponse.json({
      ok: true,
      from: parsed.from,
      to: parsed.to,
      rows: result.rows,
      summary,
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}

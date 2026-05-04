import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const QuerySchema = z
  .object({
    from: MonthSchema.optional(),
    to: MonthSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

type MonthlyRow = {
  month: string;
  income: string | number | null;
  expense: string | number | null;
  row_count: string | number | null;
};

function defaultToMonth() {
  return new Date().toISOString().slice(0, 7);
}

function defaultFromMonth(toMonth: string) {
  const [year, month] = toMonth.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 12, 1));
  return d.toISOString().slice(0, 7);
}

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    const parsed = QuerySchema.parse(raw);

    const to = parsed.to ?? defaultToMonth();
    const from = parsed.from ?? defaultFromMonth(to);

    if (from > to) {
      return jsonError("from must be before or equal to to", 400);
    }

    const result = await pool.query<MonthlyRow>(
      `WITH bounds AS (
         SELECT
           to_date($1 || '-01', 'YYYY-MM-DD') AS from_date,
           to_date($2 || '-01', 'YYYY-MM-DD') AS to_month_date
       ), months AS (
         SELECT generate_series(
           date_trunc('month', from_date),
           date_trunc('month', to_month_date),
           interval '1 month'
         )::date AS month_start
         FROM bounds
       ), ledger AS (
         SELECT
           date_trunc('month', transaction_date)::date AS month_start,
           SUM(
             CASE
               WHEN credit_account ILIKE '%売上%'
                 OR credit_account ILIKE '%収入%'
                 OR credit_account ILIKE '%入金%'
                 OR credit_account ILIKE '%sales%'
                 OR credit_account ILIKE '%revenue%'
                 OR credit_account ILIKE '%income%'
               THEN COALESCE(credit_amount, 0)
               ELSE 0
             END
           )::numeric(18,2) AS income,
           SUM(
             CASE
               WHEN credit_account ILIKE '%売上%'
                 OR credit_account ILIKE '%収入%'
                 OR credit_account ILIKE '%入金%'
                 OR credit_account ILIKE '%sales%'
                 OR credit_account ILIKE '%revenue%'
                 OR credit_account ILIKE '%income%'
               THEN 0
               ELSE COALESCE(debit_amount, credit_amount, 0)
             END
           )::numeric(18,2) AS expense,
           COUNT(*)::int AS row_count
         FROM expense_ledger, bounds
         WHERE transaction_date >= bounds.from_date
           AND transaction_date < (bounds.to_month_date + interval '1 month')
         GROUP BY date_trunc('month', transaction_date)::date
       )
       SELECT
         to_char(months.month_start, 'YYYY-MM') AS month,
         COALESCE(ledger.income, 0)::numeric(18,2) AS income,
         COALESCE(ledger.expense, 0)::numeric(18,2) AS expense,
         COALESCE(ledger.row_count, 0)::int AS row_count
       FROM months
       LEFT JOIN ledger ON ledger.month_start = months.month_start
       ORDER BY months.month_start ASC;`,
      [from, to]
    );

    const months = result.rows.map((row) => {
      const income = Number(row.income ?? 0);
      const expense = Number(row.expense ?? 0);
      return {
        month: row.month,
        income,
        expense,
        net: income - expense,
        rowCount: Number(row.row_count ?? 0),
      };
    });

    const summary = months.reduce(
      (acc, row) => {
        acc.incomeTotal += row.income;
        acc.expenseTotal += row.expense;
        acc.netTotal += row.net;
        acc.rowCount += row.rowCount;
        return acc;
      },
      { incomeTotal: 0, expenseTotal: 0, netTotal: 0, rowCount: 0 }
    );

    return NextResponse.json({ ok: true, from, to, summary, months });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/dashboard/monthly error", message);
    return jsonError(message, 500);
  }
}

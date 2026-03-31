import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const JournalLineInputSchema = z.object({
  side: z.enum(["debit", "credit"]),
  account_code: z.string().min(1),
  vendor_name: z.string().optional(),
  amount: z.coerce.number().nonnegative(),
  tax_amount: z.coerce.number().nonnegative().optional(),
  invoice_category: z.string().optional(),
  line_description: z.string().optional(),
});

const JournalCreateSchema = z
  .object({
    transaction_date: z.string().min(1),
    description: z.string().optional(),
    memo: z.string().optional(),
    source_type: z.enum(["manual", "receipt_ai", "import", "adjustment", "closing"]).optional(),
    lines: z.array(JournalLineInputSchema).min(2),
  })
  .strict();

function normalizeDate(value: string) {
  const v = value.trim();
  return v.includes("T") ? v.slice(0, 10) : v;
}

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

function isBalanced(lines: z.infer<typeof JournalLineInputSchema>[]) {
  const debit = lines.filter((l) => l.side === "debit").reduce((sum, l) => sum + Number(l.amount), 0);
  const credit = lines.filter((l) => l.side === "credit").reduce((sum, l) => sum + Number(l.amount), 0);
  return Math.abs(debit - credit) < 0.000001;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const rows = await pool.query(
      `SELECT
         j.journal_uuid,
         j.journal_number,
         j.transaction_date,
         j.description,
         j.memo,
         j.source_type,
         j.status,
         j.created_at,
         j.updated_at,
         COALESCE(SUM(CASE WHEN jl.side = 'debit' THEN jl.amount ELSE 0 END), 0)::numeric(18,2) AS total_debit,
         COALESCE(SUM(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE 0 END), 0)::numeric(18,2) AS total_credit,
         COUNT(jl.journal_line_uuid)::int AS line_count
       FROM journals j
       LEFT JOIN journal_lines jl ON jl.journal_uuid = j.journal_uuid
       GROUP BY j.journal_uuid
       ORDER BY j.transaction_date DESC, j.journal_number DESC
       LIMIT $1 OFFSET $2;`,
      [query.limit, query.offset]
    );

    return NextResponse.json({ ok: true, limit: query.limit, offset: query.offset, rows: rows.rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}

export async function POST(req: Request) {
  const client = await pool.connect();
  try {
    const body = JournalCreateSchema.parse(await req.json());

    if (!isBalanced(body.lines)) {
      return jsonError("Journal is not balanced. debit and credit totals must match.", 400);
    }

    await client.query("BEGIN");

    const journalRes = await client.query<{
      journal_uuid: string;
      journal_number: number;
      transaction_date: string;
      description: string | null;
      memo: string | null;
      source_type: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO journals (
         transaction_date,
         description,
         memo,
         source_type,
         status
       ) VALUES ($1, $2, $3, $4, 'posted')
       RETURNING journal_uuid, journal_number, transaction_date, description, memo, source_type, status, created_at, updated_at;`,
      [normalizeDate(body.transaction_date), body.description ?? null, body.memo ?? null, body.source_type ?? "manual"]
    );

    const journal = journalRes.rows[0];

    for (let i = 0; i < body.lines.length; i++) {
      const line = body.lines[i];
      await client.query(
        `INSERT INTO journal_lines (
          journal_uuid,
          line_no,
          side,
          account_code,
          vendor_name,
          amount,
          tax_amount,
          invoice_category,
          line_description
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`,
        [
          journal.journal_uuid,
          i + 1,
          line.side,
          line.account_code,
          line.vendor_name ?? null,
          line.amount,
          line.tax_amount ?? 0,
          line.invoice_category ?? "区分記載",
          line.line_description ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, journal }, { status: 201 });
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  } finally {
    client.release();
  }
}

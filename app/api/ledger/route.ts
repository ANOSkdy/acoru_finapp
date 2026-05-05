import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const SORTABLE_COLUMN_MAP = {
  journal_id: "journal_id",
  transaction_date: "transaction_date",
  debit_account: "debit_account",
  debit_vendor: "debit_vendor",
  debit_tax: "debit_tax",
  debit_amount: "debit_amount",
  credit_account: "credit_account",
  credit_amount: "credit_amount",
  description: "description",
  memo: "memo",
  created_at: "created_at",
} as const;

const QuerySchema = z
  .object({
    q: z.string().optional(),
    from: MonthSchema.optional(),
    to: MonthSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).default(0),
    sortBy: z
      .enum([
        "journal_id",
        "transaction_date",
        "debit_account",
        "debit_vendor",
        "debit_tax",
        "debit_amount",
        "credit_account",
        "credit_amount",
        "description",
        "memo",
        "created_at",
      ])
      .default("transaction_date"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

const CreateSchema = z
  .object({
    transaction_date: z.string().min(1),
    debit_account: z.string().min(1),
    debit_vendor: z.string().default(""),
    debit_amount: z.coerce.number().int().nonnegative(),
    debit_tax: z.coerce.number().int().nonnegative().default(0),
    debit_invoice_category: z.string().default("区分記載"),
    credit_account: z.string().min(1),
    credit_vendor: z.string().default(""),
    credit_amount: z.coerce.number().int().nonnegative(),
    credit_tax: z.coerce.number().int().nonnegative().default(0),
    credit_invoice_category: z.string().default("区分記載"),
    description: z.string().default(""),
    memo: z.string().default(""),
  })
  .strict();

const BulkDeleteSchema = z
  .object({
    journalIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
  })
  .strict();

function normalizeDate(value: string) {
  const v = value.trim();
  return v.includes("T") ? v.slice(0, 10) : v;
}

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    const q = parsed.q?.trim();
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      clauses.push(`(
        journal_id::text ILIKE ${p}
        OR transaction_date::text ILIKE ${p}
        OR debit_account ILIKE ${p}
        OR debit_vendor ILIKE ${p}
        OR credit_account ILIKE ${p}
        OR description ILIKE ${p}
        OR memo ILIKE ${p}
        OR drive_file_id ILIKE ${p}
        OR drive_file_name ILIKE ${p}
      )`);
    }

    if (parsed.from) {
      params.push(`${parsed.from}-01`);
      clauses.push(`transaction_date >= $${params.length}::date`);
    }

    if (parsed.to) {
      params.push(`${parsed.to}-01`);
      clauses.push(`transaction_date < ($${params.length}::date + interval '1 month')`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*)::int AS total FROM expense_ledger ${where};`;

    const sortColumn = SORTABLE_COLUMN_MAP[parsed.sortBy];
    const sortOrder = parsed.sortOrder.toUpperCase();
    const orderByClause = `ORDER BY ${sortColumn} ${sortOrder}, created_at DESC`;

    const listParams = [...params, parsed.limit, parsed.offset];
    const limitIndex = listParams.length - 1;
    const offsetIndex = listParams.length;

    const listSql = `
      SELECT
        journal_id, transaction_date,
        debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
        credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
        description, memo,
        drive_file_id, drive_file_name, drive_mime_type,
        created_at, processed_at
      FROM expense_ledger
      ${where}
      ${orderByClause}
      LIMIT $${limitIndex} OFFSET $${offsetIndex};
    `;

    const [countRes, listRes] = await Promise.all([
      pool.query<{ total: number }>(countSql, params),
      pool.query(listSql, listParams),
    ]);

    return NextResponse.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit: parsed.limit,
      offset: parsed.offset,
      rows: listRes.rows,
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/ledger error", message);
    return NextResponse.json({ ok: false, error: { message } }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());

    const r = await pool.query(
      `INSERT INTO expense_ledger (
        transaction_date,
        debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
        credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
        description, memo,
        processed_at
      )
      VALUES (
        $1,
        $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13,
        now()
      )
      RETURNING journal_id;`,
      [
        normalizeDate(body.transaction_date),
        body.debit_account,
        body.debit_vendor,
        body.debit_amount,
        body.debit_tax,
        body.debit_invoice_category,
        body.credit_account,
        body.credit_vendor,
        body.credit_amount,
        body.credit_tax,
        body.credit_invoice_category,
        body.description,
        body.memo,
      ]
    );

    return NextResponse.json({ ok: true, journal_id: r.rows[0]?.journal_id }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("POST /api/ledger error", message);
    return jsonError(message, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const body = BulkDeleteSchema.parse(await req.json());
    const uniqueIds = Array.from(new Set(body.journalIds));
    const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(", ");

    const result = await pool.query<{ journal_id: number }>(
      `DELETE FROM expense_ledger WHERE journal_id IN (${placeholders}) RETURNING journal_id;`,
      uniqueIds
    );

    return NextResponse.json({
      ok: true,
      deletedCount: result.rowCount ?? 0,
      deletedIds: result.rows.map((r) => String(r.journal_id)),
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("DELETE /api/ledger error", message);
    return jsonError(message, 500);
  }
}

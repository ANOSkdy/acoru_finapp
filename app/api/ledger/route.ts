import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const q = parsed.q?.trim();
    const like = q ? `%${q}%` : null;

    const where = q
      ? `
        WHERE
          journal_id::text ILIKE $1
          OR transaction_date::text ILIKE $1
          OR debit_account ILIKE $1
          OR debit_vendor ILIKE $1
          OR credit_account ILIKE $1
          OR description ILIKE $1
          OR memo ILIKE $1
          OR drive_file_id ILIKE $1
          OR drive_file_name ILIKE $1
      `
      : "";

    const countSql = `SELECT COUNT(*)::int AS total FROM expense_ledger ${where};`;
    const listSqlNoQ = `
      SELECT
        journal_id, transaction_date,
        debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
        credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
        description, memo,
        drive_file_id, drive_file_name, drive_mime_type,
        created_at, processed_at
      FROM expense_ledger
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const listSqlWithQ = `
      SELECT
        journal_id, transaction_date,
        debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
        credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
        description, memo,
        drive_file_id, drive_file_name, drive_mime_type,
        created_at, processed_at
      FROM expense_ledger
      ${where}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const countParams = q ? [like] : [];
    const listParams = q ? [like, parsed.limit, parsed.offset] : [parsed.limit, parsed.offset];

    const [countRes, listRes] = await Promise.all([
      pool.query(countSql, countParams),
      pool.query(q ? listSqlWithQ : listSqlNoQ, listParams),
    ]);

    return NextResponse.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit: parsed.limit,
      offset: parsed.offset,
      rows: listRes.rows,
    });
  } catch (e: any) {
    console.error("GET /api/ledger error", e);
    return NextResponse.json(
      { ok: false, error: { message: e?.message ?? "Internal error" } },
      { status: 500 }
    );
  }
}

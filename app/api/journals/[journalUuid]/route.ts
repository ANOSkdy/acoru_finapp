import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ journalUuid: string }> };

const JournalLineInputSchema = z.object({
  side: z.enum(["debit", "credit"]),
  account_code: z.string().min(1),
  vendor_name: z.string().optional(),
  amount: z.coerce.number().nonnegative(),
  tax_amount: z.coerce.number().nonnegative().optional(),
  invoice_category: z.string().optional(),
  line_description: z.string().optional(),
});

const PatchSchema = z
  .object({
    transaction_date: z.string().optional(),
    description: z.string().optional(),
    memo: z.string().optional(),
    source_type: z.enum(["manual", "receipt_ai", "import", "adjustment", "closing"]).optional(),
    status: z.enum(["draft", "posted", "void"]).optional(),
    lines: z.array(JournalLineInputSchema).min(2).optional(),
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

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { journalUuid } = await params;

    const headerRes = await pool.query(
      `SELECT
         journal_uuid,
         journal_number,
         transaction_date,
         description,
         memo,
         source_type,
         source_receipt_id,
         source_file_name,
         source_mime_type,
         status,
         created_at,
         updated_at
       FROM journals
       WHERE journal_uuid = $1;`,
      [journalUuid]
    );

    if (headerRes.rowCount === 0) {
      return jsonError("Not found", 404);
    }

    const lineRes = await pool.query(
      `SELECT
         journal_line_uuid,
         journal_uuid,
         line_no,
         side,
         account_code,
         vendor_name,
         amount,
         tax_amount,
         invoice_category,
         line_description,
         created_at
       FROM journal_lines
       WHERE journal_uuid = $1
       ORDER BY line_no ASC;`,
      [journalUuid]
    );

    return NextResponse.json({ ok: true, journal: headerRes.rows[0], lines: lineRes.rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonError(message, 500);
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const client = await pool.connect();
  try {
    const { journalUuid } = await params;
    const body = PatchSchema.parse(await req.json());

    if (body.lines && !isBalanced(body.lines)) {
      return jsonError("Journal is not balanced. debit and credit totals must match.", 400);
    }

    await client.query("BEGIN");

    const sets: string[] = [];
    const values: Array<string> = [];
    let i = 1;

    if (body.transaction_date !== undefined) {
      sets.push(`transaction_date = $${i++}::date`);
      values.push(normalizeDate(body.transaction_date));
    }
    if (body.description !== undefined) {
      sets.push(`description = $${i++}`);
      values.push(body.description);
    }
    if (body.memo !== undefined) {
      sets.push(`memo = $${i++}`);
      values.push(body.memo);
    }
    if (body.source_type !== undefined) {
      sets.push(`source_type = $${i++}`);
      values.push(body.source_type);
    }
    if (body.status !== undefined) {
      sets.push(`status = $${i++}`);
      values.push(body.status);
    }

    if (sets.length > 0) {
      sets.push("updated_at = now()");
      values.push(journalUuid);
      await client.query(`UPDATE journals SET ${sets.join(", ")} WHERE journal_uuid = $${i};`, values);
    }

    if (body.lines) {
      await client.query(`DELETE FROM journal_lines WHERE journal_uuid = $1;`, [journalUuid]);
      for (let idx = 0; idx < body.lines.length; idx++) {
        const line = body.lines[idx];
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
            journalUuid,
            idx + 1,
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
      await client.query(`UPDATE journals SET updated_at = now() WHERE journal_uuid = $1;`, [journalUuid]);
    }

    const exists = await client.query(`SELECT journal_uuid FROM journals WHERE journal_uuid = $1;`, [journalUuid]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Not found", 404);
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, journal_uuid: journalUuid });
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

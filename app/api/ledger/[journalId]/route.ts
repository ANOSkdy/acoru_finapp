// app/api/ledger/[journalId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    transaction_date: z.string().optional(), // "YYYY-MM-DD" or ISO
    debit_account: z.string().optional(),
    debit_vendor: z.string().optional(),
    debit_amount: z.coerce.number().int().nonnegative().optional(),
    debit_tax: z.coerce.number().int().nonnegative().optional(),
    debit_invoice_category: z.string().optional(),

    credit_account: z.string().optional(),
    credit_vendor: z.string().optional(),
    credit_amount: z.coerce.number().int().nonnegative().optional(),
    credit_tax: z.coerce.number().int().nonnegative().optional(),
    credit_invoice_category: z.string().optional(),

    description: z.string().optional(),
    memo: z.string().optional(),
  })
  .strict();

function normalizeDate(value: string) {
  const v = value.trim();
  return v.includes("T") ? v.slice(0, 10) : v;
}

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

type RouteContext = { params: Promise<{ journalId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { journalId } = await params;
    const id = journalId;

    if (!/^\d+$/.test(id)) return jsonError("Invalid journalId", 400);

    // PowerShell/環境差で req.json() が空扱いになることがあるため text→parse に統一
    const raw = await req.text();
    console.log("PATCH raw body:", (raw ?? "").slice(0, 2000));

    let parsed: unknown = {};
    const trimmed = (raw ?? "").trim();
    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return jsonError("Invalid JSON body", 400);
      }
    }

    const body = PatchSchema.parse(parsed);

    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (body.transaction_date !== undefined) {
      sets.push(`transaction_date = $${i++}::date`);
      values.push(normalizeDate(body.transaction_date));
    }

    if (body.debit_account !== undefined) {
      sets.push(`debit_account = $${i++}`);
      values.push(body.debit_account);
    }
    if (body.debit_vendor !== undefined) {
      sets.push(`debit_vendor = $${i++}`);
      values.push(body.debit_vendor);
    }
    if (body.debit_amount !== undefined) {
      sets.push(`debit_amount = $${i++}`);
      values.push(body.debit_amount);
    }
    if (body.debit_tax !== undefined) {
      sets.push(`debit_tax = $${i++}`);
      values.push(body.debit_tax);
    }
    if (body.debit_invoice_category !== undefined) {
      sets.push(`debit_invoice_category = $${i++}`);
      values.push(body.debit_invoice_category);
    }

    if (body.credit_account !== undefined) {
      sets.push(`credit_account = $${i++}`);
      values.push(body.credit_account);
    }
    if (body.credit_vendor !== undefined) {
      sets.push(`credit_vendor = $${i++}`);
      values.push(body.credit_vendor);
    }
    if (body.credit_amount !== undefined) {
      sets.push(`credit_amount = $${i++}`);
      values.push(body.credit_amount);
    }
    if (body.credit_tax !== undefined) {
      sets.push(`credit_tax = $${i++}`);
      values.push(body.credit_tax);
    }
    if (body.credit_invoice_category !== undefined) {
      sets.push(`credit_invoice_category = $${i++}`);
      values.push(body.credit_invoice_category);
    }

    if (body.description !== undefined) {
      sets.push(`description = $${i++}`);
      values.push(body.description);
    }
    if (body.memo !== undefined) {
      sets.push(`memo = $${i++}`);
      values.push(body.memo);
    }

    if (sets.length === 0) return jsonError("No fields to update", 400);

    sets.push(`processed_at = now()`);

    // journal_id が bigint でも確実に当てる
    values.push(id);

    const sql = `
      UPDATE expense_ledger
      SET ${sets.join(", ")}
      WHERE journal_id::text = $${i}
      RETURNING
        journal_id, transaction_date,
        debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
        credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
        description, memo,
        drive_file_id, drive_file_name, drive_mime_type,
        created_at, processed_at;
    `;

    const r = await pool.query(sql, values);
    if (r.rowCount === 0) return jsonError("Not found", 404);

    return NextResponse.json({ ok: true, row: r.rows[0] });
  } catch (e: any) {
    if (e?.name === "ZodError") return jsonError("Validation error", 400, e?.issues ?? e);
    console.error("PATCH /api/ledger/[journalId] error", e);
    return jsonError(e?.message ?? "Internal error", 500);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { journalId } = await params;
    const id = journalId;

    if (!/^\d+$/.test(id)) return jsonError("Invalid journalId", 400);

    const r = await pool.query(
      `DELETE FROM expense_ledger WHERE journal_id::text = $1 RETURNING journal_id;`,
      [id]
    );
    if (r.rowCount === 0) return jsonError("Not found", 404);

    return NextResponse.json({ ok: true, journal_id: r.rows[0].journal_id });
  } catch (e: any) {
    console.error("DELETE /api/ledger/[journalId] error", e);
    return jsonError(e?.message ?? "Internal error", 500);
  }
}

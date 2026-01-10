import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { acquireCronLock, releaseCronLock } from "@/lib/cronLock";
import { reserveReceipts, markError, markProcessed } from "@/lib/receiptQueue";
import { analyzeReceipt } from "@/lib/gemini";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Blob fetch failed: ${r.status} ${r.statusText}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "cron secret is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const lockedBy = `cron-${process.env.VERCEL_REGION ?? "local"}`;
  const acquired = await acquireCronLock("process-receipts", env.CRON_LOCK_TTL_SECONDS, lockedBy);
  if (!acquired) return NextResponse.json({ ok: true, skipped: true, reason: "locked" });

  let processed = 0;
  let failed = 0;

  try {
    const targets = await reserveReceipts(env.MAX_FILES_PER_RUN);

    for (const t of targets) {
      try {
        const buf = await fetchAsBuffer(t.blob_url);
        const extracted = await analyzeReceipt(buf, t.mime_type);

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const insert = await client.query<{ journal_id: number }>(
            `INSERT INTO expense_ledger (
              transaction_date,
              debit_account, debit_vendor, debit_amount, debit_tax, debit_invoice_category,
              credit_account, credit_vendor, credit_amount, credit_tax, credit_invoice_category,
              description, memo,
              drive_file_id, drive_file_name, drive_mime_type,
              gemini_response
            )
            VALUES (
              $1,
              $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11,
              $12, $13,
              $14, $15, $16,
              $17
            )
            RETURNING journal_id`,
            [
              extracted.transaction_date,
              extracted.suggested_debit_account || "雑費",
              extracted.store_name || "",
              extracted.total_amount || 0,
              extracted.tax_amount || 0,
              extracted.invoice_category || "区分記載",

              env.DEFAULT_CREDIT_ACCOUNT,
              "",
              extracted.total_amount || 0,
              extracted.tax_amount || 0,
              extracted.invoice_category || "区分記載",

              extracted.description || "",
              extracted.memo || "",

              t.receipt_id,
              t.file_name,
              t.mime_type,

              extracted,
            ]
          );

          const journalId = insert.rows[0].journal_id;

          await client.query("COMMIT");
          await markProcessed(t.receipt_id, journalId, extracted);

          processed++;
        } catch (e: unknown) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      } catch (e: unknown) {
        failed++;
        await markError(t.receipt_id, errorMessage(e), 600);
      }
    }

    return NextResponse.json({ ok: true, processed, failed });
  } finally {
    await releaseCronLock("process-receipts", lockedBy);
  }
}

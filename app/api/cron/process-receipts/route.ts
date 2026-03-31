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


async function resolveAccountCode(client: import("@neondatabase/serverless").PoolClient, accountName: string) {
  const byName = await client.query<{ account_code: string }>(
    `SELECT account_code FROM account_master WHERE account_name = $1 LIMIT 1;`,
    [accountName]
  );
  return byName.rows[0]?.account_code ?? null;
}

async function tryCreateLinkedJournal(
  client: import("@neondatabase/serverless").PoolClient,
  input: {
    transactionDate: string;
    description: string;
    memo: string;
    sourceReceiptId: string;
    sourceFileName: string;
    sourceMimeType: string;
    debitAccountName: string;
    debitVendor: string;
    debitAmount: number;
    debitTax: number;
    debitInvoiceCategory: string;
    creditAccountName: string;
    creditAmount: number;
    creditTax: number;
    creditInvoiceCategory: string;
  }
): Promise<string | null> {
  try {
    const debitCode = await resolveAccountCode(client, input.debitAccountName);
    const creditCode = await resolveAccountCode(client, input.creditAccountName);
    if (!debitCode || !creditCode) return null;

    const journalRes = await client.query<{ journal_uuid: string }>(
      `INSERT INTO journals (
        transaction_date,
        description,
        memo,
        source_type,
        source_receipt_id,
        source_file_name,
        source_mime_type,
        status
      ) VALUES ($1, $2, $3, 'receipt_ai', $4, $5, $6, 'posted')
      RETURNING journal_uuid;`,
      [
        input.transactionDate,
        input.description,
        input.memo,
        input.sourceReceiptId,
        input.sourceFileName,
        input.sourceMimeType,
      ]
    );

    const journalUuid = journalRes.rows[0]?.journal_uuid;
    if (!journalUuid) return null;

    await client.query(
      `INSERT INTO journal_lines (
        journal_uuid, line_no, side, account_code, vendor_name, amount, tax_amount, invoice_category, line_description
      ) VALUES
        ($1, 1, 'debit', $2, $3, $4, $5, $6, $7),
        ($1, 2, 'credit', $8, NULL, $9, $10, $11, $12);`,
      [
        journalUuid,
        debitCode,
        input.debitVendor,
        input.debitAmount,
        input.debitTax,
        input.debitInvoiceCategory,
        input.description,
        creditCode,
        input.creditAmount,
        input.creditTax,
        input.creditInvoiceCategory,
        input.description,
      ]
    );

    return journalUuid;
  } catch (e: unknown) {
    console.warn("linked journal creation skipped", errorMessage(e));
    return null;
  }
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Blob fetch failed: ${r.status} ${r.statusText}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

export async function GET(req: Request) {
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

          const linkedJournalUuid = await tryCreateLinkedJournal(client, {
            transactionDate: extracted.transaction_date,
            description: extracted.description || "",
            memo: extracted.memo || "",
            sourceReceiptId: t.receipt_id,
            sourceFileName: t.file_name,
            sourceMimeType: t.mime_type,
            debitAccountName: extracted.suggested_debit_account || "雑費",
            debitVendor: extracted.store_name || "",
            debitAmount: extracted.total_amount || 0,
            debitTax: extracted.tax_amount || 0,
            debitInvoiceCategory: extracted.invoice_category || "区分記載",
            creditAccountName: env.DEFAULT_CREDIT_ACCOUNT,
            creditAmount: extracted.total_amount || 0,
            creditTax: extracted.tax_amount || 0,
            creditInvoiceCategory: extracted.invoice_category || "区分記載",
          });

          if (linkedJournalUuid) {
            await client.query(`UPDATE expense_ledger SET journal_uuid = $1 WHERE journal_id = $2;`, [
              linkedJournalUuid,
              journalId,
            ]);
            await client.query(`UPDATE receipt_queue SET journal_uuid = $1 WHERE receipt_id = $2;`, [
              linkedJournalUuid,
              t.receipt_id,
            ]);
          }

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
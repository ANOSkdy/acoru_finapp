import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertReceiptQueue } from "@/lib/receiptQueue";

export const runtime = "nodejs";

const BodySchema = z.object({
  receiptId: z.string().uuid(),
  blobUrl: z.string().url(),
  pathname: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "application/pdf"]),
  sizeBytes: z.number().int().nonnegative(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    await upsertReceiptQueue({
      receiptId: body.receiptId,
      blobUrl: body.blobUrl,
      pathname: body.pathname,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return NextResponse.json({ ok: true, receiptId: body.receiptId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { message: e?.message ?? "bad request" } },
      { status: 400 }
    );
  }
}

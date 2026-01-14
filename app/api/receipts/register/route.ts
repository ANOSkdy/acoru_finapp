import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertReceiptQueue } from "@/lib/receiptQueue";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  receiptId: z.string().uuid(),
  blobUrl: z.string().url(),
  pathname: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/jpg", "application/pdf"]),
  sizeBytes: z.number().int().nonnegative(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    if (body.sizeBytes > env.MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: { message: "File too large" } },
        { status: 413 }
      );
    }

    await upsertReceiptQueue({
      receiptId: body.receiptId,
      blobUrl: body.blobUrl,
      pathname: body.pathname,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });

    return NextResponse.json({ ok: true, receiptId: body.receiptId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: { message } }, { status: 400 });
  }
}

import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const PayloadSchema = z.object({
  receiptId: z.string().uuid(),
});

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsed = PayloadSchema.parse(JSON.parse(clientPayload ?? "{}"));

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"],
          maximumSizeInBytes: env.MAX_FILE_BYTES,
          tokenPayload: JSON.stringify({ receiptId: parsed.receiptId }),
          access: "public",
        };
      },
      // NOTE: DB queue is created by /api/receipts/register (client calls it with sizeBytes).
      onUploadCompleted: async () => {
        return;
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("blob upload route error", message);
    return NextResponse.json({ ok: false, error: { message } }, { status: 400 });
  }
}

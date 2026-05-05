import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PayloadSchema = z.object({
  receiptId: z.string().uuid(),
});

type HandleUploadBody = Parameters<typeof handleUpload>[0]["body"];

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function POST(request: Request) {
  try {
    let body: HandleUploadBody;
    try {
      body = (await request.json()) as HandleUploadBody;
    } catch {
      return jsonError("Invalid upload request body", 400);
    }

    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payload: unknown;
        try {
          payload = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new Error("Invalid clientPayload JSON");
        }

        const parsed = PayloadSchema.parse(payload);

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
    return jsonError(message, 400);
  }
}

import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { upsertReceiptQueue } from "@/lib/receiptQueue";

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
          // jpg / jpeg / pdf
          allowedContentTypes: ["image/jpeg", "application/pdf"],
          maximumSizeInBytes: env.MAX_FILE_BYTES,
          tokenPayload: JSON.stringify({ receiptId: parsed.receiptId }),
          access: "public", // ✅ 追加
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // ローカル開発ではここが到達しない場合がある（Blobがlocalhostにコールバックできないため）
        // そのため register API を別で叩く方式を併用する（冪等なので二重でもOK）
        const parsed = PayloadSchema.parse(JSON.parse(tokenPayload ?? "{}"));

        await upsertReceiptQueue({
          receiptId: parsed.receiptId,
          blobUrl: blob.url,
          pathname: blob.pathname,
          fileName: blob.pathname.split("/").pop() ?? blob.pathname,
          mimeType: blob.contentType ?? "application/octet-stream",
          sizeBytes: blob.size,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    console.error("blob upload route error", e);
    return NextResponse.json(
      { ok: false, error: { message: e?.message ?? "upload failed" } },
      { status: 400 }
    );
  }
}

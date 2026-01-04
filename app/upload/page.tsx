"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";

type Result = { receiptId: string; fileName: string; ok: boolean; message?: string };

export default function UploadPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    setBusy(true);
    const next: Result[] = [];

    for (const file of files) {
      const receiptId = crypto.randomUUID();

      try {
        const blob = await upload(file.name, file, {
          handleUploadUrl: "/api/blob/upload",
          clientPayload: JSON.stringify({ receiptId }),
          multipart: true,
          access: "public",
        });

        const res = await fetch("/api/receipts/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiptId,
            blobUrl: blob.url,
            pathname: blob.pathname,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(j?.error?.message ?? `register failed: ${res.status}`);
        }

        next.push({ receiptId, fileName: file.name, ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        next.push({ receiptId, fileName: file.name, ok: false, message });
      }
    }

    setResults(next);
    setBusy(false);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>領収書アップロード</h1>

      <form onSubmit={onSubmit}>
        <input name="files" type="file" accept=".jpg,.jpeg,.pdf" multiple />
        <button type="submit" disabled={busy} style={{ marginLeft: 8 }}>
          {busy ? "Uploading..." : "Upload"}
        </button>
      </form>

      <hr style={{ margin: "16px 0" }} />

      <ul>
        {results.map((r) => (
          <li key={r.receiptId}>
            {r.ok ? "✅" : "❌"} {r.fileName} / {r.receiptId}
            {!r.ok && r.message ? ` / ${r.message}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
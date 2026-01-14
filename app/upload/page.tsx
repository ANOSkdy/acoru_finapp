"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";

type Result = { receiptId: string; fileName: string; ok: boolean; message?: string };

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.pdf";

export default function UploadPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    const invalidFiles = files.filter(
      (file) => !ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])
    );
    if (invalidFiles.length > 0) {
      setValidationError(
        `未対応のファイル形式です。PNG/JPEG/PDFのみアップロードできます: ${invalidFiles
          .map((file) => file.name)
          .join(", ")}`
      );
    } else {
      setValidationError(null);
    }

    setBusy(true);
    const next: Result[] = [];

    for (const file of files) {
      const receiptId = crypto.randomUUID();

      try {
        if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
          next.push({
            receiptId,
            fileName: file.name,
            ok: false,
            message: "未対応のファイル形式です。PNG/JPEG/PDFのみアップロードできます。",
          });
          continue;
        }

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

  function resetUpload() {
    setResults([]);
    setSelectedNames([]);
    setValidationError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <main>
      <h2 className="page-title">領収書アップロード</h2>
      <p className="page-subtitle">
        スマホから撮ったレシートをまとめてアップロードできます。JPG/PNG/PDF を選択してください。
      </p>

      <form onSubmit={onSubmit} className="upload-card">
        <label className="upload-drop">
          <input
            ref={inputRef}
            className="upload-input"
            name="files"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              const invalidFiles = files.filter(
                (file) =>
                  !ALLOWED_MIME_TYPES.includes(
                    file.type as (typeof ALLOWED_MIME_TYPES)[number]
                  )
              );
              if (invalidFiles.length > 0) {
                setValidationError(
                  `未対応のファイル形式です。PNG/JPEG/PDFのみアップロードできます: ${invalidFiles
                    .map((file) => file.name)
                    .join(", ")}`
                );
              } else {
                setValidationError(null);
              }
              setSelectedNames(files.map((file) => file.name));
            }}
          />
          <strong>ファイルを選択</strong>
          <div className="record-meta">タップして領収書を追加（複数選択可）</div>
          {selectedNames.length > 0 ? (
            <div className="record-meta">{selectedNames.length} 件選択済み</div>
          ) : null}
        </label>

        {selectedNames.length > 0 ? (
          <ul className="upload-results">
            {selectedNames.map((name) => (
              <li key={name} className="upload-result">
                <span>{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="record-meta">まだファイルが選択されていません。</div>
        )}
        {validationError ? <div className="status-fail">{validationError}</div> : null}

        <div className="upload-actions">
          <button
            className="btn"
            type="submit"
            disabled={busy || selectedNames.length === 0 || Boolean(validationError)}
          >
            {busy ? "Uploading..." : "アップロードを開始"}
          </button>
          {results.length > 0 && !busy ? (
            <div className="record-actions">
              <button className="btn-secondary btn" type="button" onClick={resetUpload}>
                Upload more
              </button>
              <Link className="btn btn-ghost" href="/recordlists">
                Go to Record List
              </Link>
            </div>
          ) : null}
        </div>
      </form>

      <section style={{ marginTop: 20 }}>
        <h3>アップロード結果</h3>
        {busy ? <p className="record-meta">Uploading...</p> : null}
        <ul className="upload-results">
          {results.map((r) => (
            <li key={r.receiptId} className="upload-result">
              <span className={r.ok ? "status-success" : "status-fail"}>
                {r.ok ? "✅ 成功" : "❌ 失敗"} - {r.fileName}
              </span>
              <span className="record-meta">receipt_id: {r.receiptId}</span>
              {!r.ok && r.message ? <span className="record-meta">{r.message}</span> : null}
            </li>
          ))}
          {results.length === 0 && !busy ? (
            <li className="upload-result">まだ結果はありません。</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

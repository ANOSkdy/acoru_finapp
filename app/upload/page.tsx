"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";

type Result = { receiptId: string; fileName: string; ok: boolean; message?: string };

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "pdf"] as const;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "application/pdf"] as const;

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const FRIENDLY_UNSUPPORTED_MESSAGE = (
  extLabel: string,
  mimeLabel: string
) =>
  `検出された形式: ${extLabel} / ${mimeLabel}。JPG/JPEG/PDF のみアップロードできます。` +
  "スクリーンショットは PNG の場合が多いので、JPG または PDF に変換して再度お試しください。";

function getExtension(fileName: string) {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase());
  return match?.[1] ?? "";
}

function isAllowedUpload(file: File) {
  const ext = getExtension(file.name);
  const hasMime = file.type.length > 0;
  const mimeAllowed = !hasMime || (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);
  const extAllowed = ext.length === 0 || (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  return { ext, mimeAllowed, extAllowed };
}

function mapUploadErrorMessage(error: unknown, extLabel: string, mimeLabel: string) {
  if (error instanceof Error) {
    if (error.message.includes("Content type mismatch")) {
      console.error("Blob upload rejected by content type.", error);
      return FRIENDLY_UNSUPPORTED_MESSAGE(extLabel, mimeLabel);
    }
    return error.message;
  }
  return String(error);
}

export default function UploadPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      const { ext, mimeAllowed, extAllowed } = isAllowedUpload(file);
      const extLabel = ext ? `.${ext}` : "不明";
      const mimeLabel = file.type || "不明";

      if (!mimeAllowed || !extAllowed) {
        next.push({
          receiptId,
          fileName: file.name,
          ok: false,
          message: FRIENDLY_UNSUPPORTED_MESSAGE(extLabel, mimeLabel),
        });
        continue;
      }

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
        const message = mapUploadErrorMessage(err, extLabel, mimeLabel);
        next.push({ receiptId, fileName: file.name, ok: false, message });
      }
    }

    setResults(next);
    setBusy(false);
  }

  function resetUpload() {
    setResults([]);
    setSelectedNames([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <main>
      <h2 className="page-title">領収書アップロード</h2>
      <p className="page-subtitle">
        スマホから撮ったレシートをまとめてアップロードできます。JPG/PDF を選択してください。
      </p>

      <form onSubmit={onSubmit} className="upload-card">
        <label className="upload-drop">
          <input
            ref={inputRef}
            className="upload-input"
            name="files"
            type="file"
            accept=".jpg,.jpeg,.pdf"
            multiple
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              setSelectedNames(files.map((file) => file.name));
            }}
          />
          <strong>ファイルを選択</strong>
          <div className="record-meta">タップして領収書を追加（複数選択可）</div>
          <div className="record-meta">対応形式: JPG/JPEG/PDF</div>
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

        <div className="upload-actions">
          <button className="btn" type="submit" disabled={busy || selectedNames.length === 0}>
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

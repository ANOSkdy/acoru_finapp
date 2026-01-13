"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_amount: string;
  debit_tax: string;
  credit_account: string;
  credit_amount: string;
  description: string | null;
  memo: string | null;
};

type DetailResponse = {
  ok: boolean;
  row?: LedgerRow;
  error?: { message: string };
};

type Draft = {
  transaction_date: string;
  debit_account: string;
  debit_vendor: string;
  debit_amount: string;
  debit_tax: string;
  credit_account: string;
  credit_amount: string;
  description: string;
  memo: string;
};

function toDateInputValue(v: string) {
  if (!v) return "";
  return v.includes("T") ? v.slice(0, 10) : v;
}

function toInt(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export default function RecordEditDetailPage({
  params,
}: {
  params: { journalId: string };
}) {
  const { journalId } = params;
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/ledger/${journalId}`, { cache: "no-store" });
      const json = (await res.json()) as DetailResponse;
      if (!res.ok || !json.ok || !json.row) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const row = json.row;
      setDraft({
        transaction_date: toDateInputValue(row.transaction_date),
        debit_account: row.debit_account ?? "",
        debit_vendor: row.debit_vendor ?? "",
        debit_amount: row.debit_amount ?? "0",
        debit_tax: row.debit_tax ?? "0",
        credit_account: row.credit_account ?? "",
        credit_amount: row.credit_amount ?? "0",
        description: row.description ?? "",
        memo: row.memo ?? "",
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId]);

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    setStatus(null);

    try {
      const payload = {
        transaction_date: draft.transaction_date,
        debit_account: draft.debit_account,
        debit_vendor: draft.debit_vendor,
        debit_amount: toInt(draft.debit_amount),
        debit_tax: toInt(draft.debit_tax),
        credit_account: draft.credit_account,
        credit_amount: toInt(draft.credit_amount),
        description: draft.description,
        memo: draft.memo,
      };

      const res = await fetch(`/api/ledger/${journalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({} as DetailResponse))) as DetailResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setStatus({ type: "success", message: "保存しました。" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      setStatus({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow() {
    const ok = confirm(`journal_id=${journalId} を削除しますか？（元に戻せません）`);
    if (!ok) return;

    setDeleting(true);
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/ledger/${journalId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({} as DetailResponse))) as DetailResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      router.push("/recordlists");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      setStatus({ type: "error", message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main>
      <div className="record-actions" style={{ marginBottom: 12 }}>
        <Link className="btn btn-secondary" href="/recordlists">
          一覧に戻る
        </Link>
      </div>

      <h2 className="page-title">Record Edit</h2>
      <p className="page-subtitle">仕訳ID: {journalId}</p>

      {err ? <p style={{ color: "crimson" }}>Error: {err}</p> : null}
      {status ? (
        <p className={status.type === "success" ? "status-success" : "status-fail"}>{status.message}</p>
      ) : null}
      {loading && !draft ? <p className="record-meta">Loading...</p> : null}

      {draft ? (
        <div className="record-cards">
          <article className="record-card">
            <div className="record-field">
              <span className="record-label">取引日</span>
              <input
                className="record-input"
                value={draft.transaction_date}
                onChange={(e) => setDraft((d) => (d ? { ...d, transaction_date: e.target.value } : d))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方科目</span>
              <input
                className="record-input"
                value={draft.debit_account}
                onChange={(e) => setDraft((d) => (d ? { ...d, debit_account: e.target.value } : d))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">取引先</span>
              <input
                className="record-input"
                value={draft.debit_vendor}
                onChange={(e) => setDraft((d) => (d ? { ...d, debit_vendor: e.target.value } : d))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方税額</span>
              <input
                className="record-input"
                value={draft.debit_tax}
                onChange={(e) => setDraft((d) => (d ? { ...d, debit_tax: e.target.value } : d))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方金額</span>
              <input
                className="record-input"
                value={draft.debit_amount}
                onChange={(e) => setDraft((d) => (d ? { ...d, debit_amount: e.target.value } : d))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方科目</span>
              <input
                className="record-input"
                value={draft.credit_account}
                onChange={(e) => setDraft((d) => (d ? { ...d, credit_account: e.target.value } : d))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方金額</span>
              <input
                className="record-input"
                value={draft.credit_amount}
                onChange={(e) => setDraft((d) => (d ? { ...d, credit_amount: e.target.value } : d))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">摘要</span>
              <textarea
                className="record-input"
                value={draft.description}
                onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="record-field">
              <span className="record-label">メモ</span>
              <textarea
                className="record-input"
                value={draft.memo}
                onChange={(e) => setDraft((d) => (d ? { ...d, memo: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="record-actions">
              <button className="btn" disabled={saving} onClick={saveEdit}>
                保存
              </button>
              <button className="btn btn-secondary" disabled={saving} onClick={load}>
                再読み込み
              </button>
              <button className="btn btn-secondary" disabled={deleting} onClick={deleteRow}>
                削除
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}

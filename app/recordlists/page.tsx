"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_tax: string | number | null;
  debit_amount: string | number | null;
  credit_account: string | null;
  credit_amount: string | number | null;
  description: string | null;
  memo: string | null;
};

type ListResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  rows: LedgerRow[];
  error?: { message: string };
};

type CreateResponse = {
  ok: boolean;
  journal_id?: string;
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

export default function RecordListsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    transaction_date: new Date().toISOString().slice(0, 10),
    debit_account: "雑費",
    debit_vendor: "",
    debit_amount: "0",
    debit_tax: "0",
    credit_account: "未払金",
    credit_amount: "0",
    description: "",
    memo: "",
  });

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    return sp.toString();
  }, [q, limit, offset]);

  function toInt(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  function resetDraft() {
    setDraft({
      transaction_date: new Date().toISOString().slice(0, 10),
      debit_account: "雑費",
      debit_vendor: "",
      debit_amount: "0",
      debit_tax: "0",
      credit_account: "未払金",
      credit_amount: "0",
      description: "",
      memo: "",
    });
    setCreateErr(null);
  }

  async function createRecord() {
    setCreating(true);
    setCreateErr(null);
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

      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({} as CreateResponse))) as CreateResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setShowCreateModal(false);
      resetDraft();
      setOffset(0);
      await load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ledger?${queryString}`, { cache: "no-store" });
      const json = (await res.json()) as ListResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setRows(json.rows);
      setTotal(json.total);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <main>
      <h2 className="page-title">Record Lists</h2>
      <p className="page-subtitle">仕訳を一覧で確認して、必要なレコードを開きます。</p>

      <div className="record-toolbar">
        <div className="record-actions">
          <Link className="btn btn-secondary" href="/upload">
            アップロードへ
          </Link>
          <button
            className="btn"
            onClick={() => {
              resetDraft();
              setShowCreateModal(true);
            }}
          >
            新規登録
          </button>
        </div>

        <section className="record-controls">
          <input
            className="record-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="検索（仕訳ID/店名/科目/摘要/メモ/receipt_idなど）"
          />

          <select
            className="record-select"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <button className="btn btn-secondary" disabled={loading} onClick={() => load()}>
            再読み込み
          </button>

          <div className="record-actions">
            <button
              className="btn btn-secondary"
              disabled={loading || !canPrev}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              前へ
            </button>
            <span className="record-meta">
              {total === 0 ? "0" : `${offset + 1}-${Math.min(offset + limit, total)}`} / {total}
            </span>
            <button
              className="btn btn-secondary"
              disabled={loading || !canNext}
              onClick={() => setOffset(offset + limit)}
            >
              次へ
            </button>
          </div>
        </section>
      </div>

      {err ? <p style={{ color: "crimson" }}>Error: {err}</p> : null}
      {loading ? <p className="record-meta">Loading...</p> : null}

      <div className="record-table-wrap">
        <table className="record-grid" aria-label="仕訳一覧">
          <thead>
            <tr>
              <th>仕訳ID</th>
              <th>取引日</th>
              <th>借方科目</th>
              <th>取引先</th>
              <th>借方税額</th>
              <th>借方金額</th>
              <th>貸方科目</th>
              <th>貸方金額</th>
              <th>摘要</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.journal_id}
                tabIndex={0}
                role="link"
                className="record-grid-row"
                onClick={() => router.push(`/recordedit/${r.journal_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/recordedit/${r.journal_id}`);
                  }
                }}
                aria-label={`仕訳ID ${r.journal_id} の詳細へ`}
              >
                <td>{r.journal_id}</td>
                <td>{toDateInputValue(r.transaction_date)}</td>
                <td>{r.debit_account}</td>
                <td>{r.debit_vendor ?? "-"}</td>
                <td>{r.debit_tax ?? 0}</td>
                <td>{r.debit_amount ?? 0}</td>
                <td>{r.credit_account ?? "-"}</td>
                <td>{r.credit_amount ?? 0}</td>
                <td>{r.description || "-"}</td>
                <td>{r.memo || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="record-card">レコードがありません</div> : null}

      {showCreateModal ? (
        <div className="record-modal-overlay" role="dialog" aria-modal="true" aria-label="仕訳新規登録">
          <div className="record-modal">
            <h3 className="page-title" style={{ marginBottom: 4 }}>
              新規レコード登録
            </h3>
            <p className="record-meta">既存レコード編集と同じ項目で登録できます。</p>

            {createErr ? <p className="status-fail">Error: {createErr}</p> : null}

            <div className="record-field">
              <span className="record-label">取引日</span>
              <input
                className="record-input"
                value={draft.transaction_date}
                onChange={(e) => setDraft((d) => ({ ...d, transaction_date: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方科目</span>
              <input
                className="record-input"
                value={draft.debit_account}
                onChange={(e) => setDraft((d) => ({ ...d, debit_account: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">取引先</span>
              <input
                className="record-input"
                value={draft.debit_vendor}
                onChange={(e) => setDraft((d) => ({ ...d, debit_vendor: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方税額</span>
              <input
                className="record-input"
                value={draft.debit_tax}
                onChange={(e) => setDraft((d) => ({ ...d, debit_tax: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方金額</span>
              <input
                className="record-input"
                value={draft.debit_amount}
                onChange={(e) => setDraft((d) => ({ ...d, debit_amount: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方科目</span>
              <input
                className="record-input"
                value={draft.credit_account}
                onChange={(e) => setDraft((d) => ({ ...d, credit_account: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方金額</span>
              <input
                className="record-input"
                value={draft.credit_amount}
                onChange={(e) => setDraft((d) => ({ ...d, credit_amount: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">摘要</span>
              <textarea
                className="record-input"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="record-field">
              <span className="record-label">メモ</span>
              <textarea
                className="record-input"
                value={draft.memo}
                onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="record-actions">
              <button className="btn" disabled={creating} onClick={createRecord}>
                登録
              </button>
              <button
                className="btn btn-secondary"
                disabled={creating}
                onClick={() => {
                  setShowCreateModal(false);
                  resetDraft();
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

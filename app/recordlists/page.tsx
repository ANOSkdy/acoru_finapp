"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_amount: string;
};

type ListResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  rows: LedgerRow[];
  error?: { message: string };
};

function toDateInputValue(v: string) {
  if (!v) return "";
  return v.includes("T") ? v.slice(0, 10) : v;
}

export default function RecordListsPage() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    return sp.toString();
  }, [q, limit, offset]);

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

      <div className="record-list">
        {rows.map((r) => (
          <Link key={r.journal_id} href={`/recordedit/${r.journal_id}`} className="record-list-item">
            <div>
              <div className="record-meta">仕訳ID: {r.journal_id}</div>
              <div className="record-list-main">
                <span className="record-list-text">{toDateInputValue(r.transaction_date)}</span>
                <span className="record-list-text">{r.debit_account}</span>
                <span className="record-list-text">{r.debit_vendor ?? "-"}</span>
              </div>
            </div>
            <div className="record-list-amount">{r.debit_amount}</div>
          </Link>
        ))}
        {rows.length === 0 ? <div className="record-card">レコードがありません</div> : null}
      </div>
    </main>
  );
}

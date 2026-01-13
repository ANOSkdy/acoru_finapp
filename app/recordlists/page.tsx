"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_amount: string;
  description: string | null;
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

      <div className="record-cards">
        {rows.map((r) => (
          <article key={r.journal_id} className="record-card">
            <div className="record-meta">仕訳ID: {r.journal_id}</div>
            <div className="record-field">
              <span className="record-label">取引日</span>
              <strong>{toDateInputValue(r.transaction_date)}</strong>
            </div>
            <div className="record-field">
              <span className="record-label">借方科目</span>
              <span>{r.debit_account}</span>
            </div>
            <div className="record-field">
              <span className="record-label">取引先</span>
              <span>{r.debit_vendor ?? "-"}</span>
            </div>
            <div className="record-field">
              <span className="record-label">金額</span>
              <strong>{r.debit_amount}</strong>
            </div>
            <div className="record-field">
              <span className="record-label">摘要</span>
              <span>{r.description ?? "-"}</span>
            </div>
            <div className="record-actions">
              <Link className="btn" href={`/recordedit/${r.journal_id}`}>
                レコードを編集
              </Link>
            </div>
          </article>
        ))}
        {rows.length === 0 ? <div className="record-card">レコードがありません</div> : null}
      </div>

      <div className="record-table">
        <table cellPadding={8} style={{ borderCollapse: "collapse", minWidth: 1000 }}>
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              <th>仕訳ID</th>
              <th>取引日</th>
              <th>借方科目</th>
              <th>取引先</th>
              <th>金額</th>
              <th>摘要</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.journal_id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{r.journal_id}</td>
                <td>{toDateInputValue(r.transaction_date)}</td>
                <td>{r.debit_account}</td>
                <td>{r.debit_vendor ?? ""}</td>
                <td style={{ textAlign: "right" }}>{r.debit_amount}</td>
                <td>{r.description ?? ""}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link className="btn btn-secondary" href={`/recordedit/${r.journal_id}`}>
                    編集
                  </Link>
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 16, color: "#666" }}>
                  レコードがありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

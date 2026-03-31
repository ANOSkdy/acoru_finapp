"use client";

import { useState } from "react";

type PLRow = {
  line_code: string | null;
  line_name: string;
  account_code: string | null;
  account_name: string;
  amount: string;
  statement_type: "PL";
  mapping_status: "mapped" | "unmapped";
};

type PLResponse = {
  ok: boolean;
  from: string;
  to: string;
  rows: PLRow[];
  error?: { message?: string };
};

function defaultFromDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function PLPage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PLRow[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ from, to });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/reports/pl?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as PLResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setRows(json.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <h2 className="page-title">損益計算書</h2>
      </header>
      <div className="report-toolbar">
        <label className="report-toolbar-field">
          <div className="record-meta">from</div>
          <input className="record-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="report-toolbar-field">
          <div className="record-meta">to</div>
          <input className="record-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="report-toolbar-field report-toolbar-search">
          <div className="record-meta">検索</div>
          <input
            className="record-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="行コード/科目コード/科目名"
          />
        </label>
        <button className="btn" type="button" onClick={load} disabled={loading}>
          {loading ? "読込中..." : "読み込み"}
        </button>
      </div>
      {error ? <p className="status-error">{error}</p> : null}
      <div className="report-grid-wrap">
        <table className="report-grid" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th>行コード</th>
              <th>行名</th>
              <th>科目コード</th>
              <th>科目名</th>
              <th>金額</th>
              <th>マッピング</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="record-meta">
                  データがありません。期間を指定して読み込みしてください。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.line_code ?? "nol"}:${row.account_code ?? "na"}:${row.account_name}`}>
                  <td>{row.line_code ?? "-"}</td>
                  <td>{row.line_name}</td>
                  <td>{row.account_code ?? "-"}</td>
                  <td>{row.account_name}</td>
                  <td>{Number(row.amount ?? 0).toLocaleString("ja-JP")}</td>
                  <td>{row.mapping_status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

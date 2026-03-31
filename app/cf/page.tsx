"use client";

import { useState } from "react";

type CFRow = {
  cf_category: "operating" | "investing" | "financing" | "none";
  account_code: string | null;
  account_name: string;
  amount: string;
};

type CFResponse = {
  ok: boolean;
  from: string;
  to: string;
  rows: CFRow[];
  summary: {
    total: number;
    by_category: Record<string, number>;
  };
  error?: { message?: string };
};

function defaultFromDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function CFPage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CFRow[]>([]);
  const [summary, setSummary] = useState<CFResponse["summary"] | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ from, to });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/reports/cf?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as CFResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <h2 className="page-title">簡易キャッシュフロー</h2>
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
          <input className="record-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="区分/科目コード/科目名" />
        </label>
        <button className="btn" type="button" onClick={load} disabled={loading}>
          {loading ? "読込中..." : "読み込み"}
        </button>
      </div>

      {error ? <p className="status-error">{error}</p> : null}

      {summary ? (
        <div className="record-meta">
          営業: {Number(summary.by_category.operating ?? 0).toLocaleString("ja-JP")} / 投資: {Number(summary.by_category.investing ?? 0).toLocaleString("ja-JP")} / 財務: {Number(summary.by_category.financing ?? 0).toLocaleString("ja-JP")} / 未分類: {Number(summary.by_category.none ?? 0).toLocaleString("ja-JP")} / 合計: {Number(summary.total ?? 0).toLocaleString("ja-JP")}
        </div>
      ) : null}

      <div className="report-grid-wrap">
        <table className="report-grid" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>区分</th>
              <th>科目コード</th>
              <th>科目名</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="record-meta">
                  データがありません。期間を指定して読み込みしてください。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.cf_category}:${row.account_code ?? "-"}:${row.account_name}`}>
                  <td>{row.cf_category}</td>
                  <td>{row.account_code ?? "-"}</td>
                  <td>{row.account_name}</td>
                  <td>{Number(row.amount ?? 0).toLocaleString("ja-JP")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

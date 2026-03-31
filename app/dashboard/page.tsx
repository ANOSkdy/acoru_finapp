"use client";

import { useState } from "react";

type DashboardResponse = {
  ok: boolean;
  from: string;
  to: string;
  kpis: {
    revenue_total: number;
    expense_total: number;
    operating_profit: number;
    cash_balance: number;
  };
  queue: {
    unprocessed_receipt_count: number;
    error_receipt_count: number;
    processed_receipt_count: number;
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

function yen(v: number) {
  return v.toLocaleString("ja-JP");
}

export default function DashboardPage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ from, to });
      const res = await fetch(`/api/dashboard/summary?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DashboardResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2>ダッシュボード</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label>
          <div className="record-meta">from</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <div className="record-meta">to</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "読込中..." : "読み込み"}
        </button>
      </div>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="record-card">
          <div className="record-meta">売上</div>
          <div>{yen(data?.kpis.revenue_total ?? 0)}</div>
        </div>
        <div className="record-card">
          <div className="record-meta">費用</div>
          <div>{yen(data?.kpis.expense_total ?? 0)}</div>
        </div>
        <div className="record-card">
          <div className="record-meta">営業利益</div>
          <div>{yen(data?.kpis.operating_profit ?? 0)}</div>
        </div>
        <div className="record-card">
          <div className="record-meta">現預金残高</div>
          <div>{yen(data?.kpis.cash_balance ?? 0)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="record-card">
          <div className="record-meta">未処理領収書</div>
          <div>{data?.queue.unprocessed_receipt_count ?? 0}</div>
        </div>
        <div className="record-card">
          <div className="record-meta">エラー件数</div>
          <div>{data?.queue.error_receipt_count ?? 0}</div>
        </div>
        <div className="record-card">
          <div className="record-meta">処理済み件数</div>
          <div>{data?.queue.processed_receipt_count ?? 0}</div>
        </div>
      </div>
    </section>
  );
}

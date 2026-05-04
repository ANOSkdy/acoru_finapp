"use client";

import { useEffect, useMemo, useState } from "react";

type MonthlyRow = {
  month: string;
  income: number;
  expense: number;
  net: number;
  rowCount: number;
};

type MonthlyResponse = {
  ok: boolean;
  from: string;
  to: string;
  summary: {
    incomeTotal: number;
    expenseTotal: number;
    netTotal: number;
    rowCount: number;
  };
  months: MonthlyRow[];
  error?: { message?: string };
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthsAgo(months: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return d.toISOString().slice(0, 7);
}

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default function DashboardPage() {
  const [from, setFrom] = useState(() => monthsAgo(11));
  const [to, setTo] = useState(() => currentMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MonthlyResponse | null>(null);

  const maxAmount = useMemo(() => {
    const values = data?.months.flatMap((row) => [row.income, row.expense, Math.abs(row.net)]) ?? [];
    return Math.max(1, ...values);
  }, [data]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ from, to });
      const res = await fetch(`/api/dashboard/monthly?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MonthlyResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page-shell">
      <header className="page-header">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Record Lists の仕訳データをもとに、月別の収入・支出・収支を確認します。</p>
      </header>

      <div className="report-toolbar">
        <label className="report-toolbar-field">
          <div className="record-meta">from</div>
          <input className="record-input" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="report-toolbar-field">
          <div className="record-meta">to</div>
          <input className="record-input" type="month" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "読込中..." : "読み込み"}
        </button>
      </div>

      {error ? <p className="status-error">Error: {error}</p> : null}

      <div className="kpi-grid">
        <article className="kpi-card">
          <div className="record-meta">収入合計</div>
          <strong>{yen(data?.summary.incomeTotal ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <div className="record-meta">支出合計</div>
          <strong>{yen(data?.summary.expenseTotal ?? 0)}</strong>
        </article>
        <article className="kpi-card">
          <div className="record-meta">収支合計</div>
          <strong className={(data?.summary.netTotal ?? 0) < 0 ? "status-fail" : "status-success"}>
            {yen(data?.summary.netTotal ?? 0)}
          </strong>
        </article>
        <article className="kpi-card">
          <div className="record-meta">登録件数</div>
          <strong>{(data?.summary.rowCount ?? 0).toLocaleString("ja-JP")}件</strong>
        </article>
      </div>

      <section className="record-card">
        <h3 style={{ margin: 0 }}>月次推移</h3>
        <div style={{ display: "grid", gap: 12 }}>
          {(data?.months ?? []).map((row) => {
            const incomeWidth = `${Math.max(2, (row.income / maxAmount) * 100)}%`;
            const expenseWidth = `${Math.max(2, (row.expense / maxAmount) * 100)}%`;
            const netWidth = `${Math.max(2, (Math.abs(row.net) / maxAmount) * 100)}%`;
            return (
              <div key={row.month} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{row.month}</strong>
                  <span className={row.net < 0 ? "status-fail" : "status-success"}>収支 {yen(row.net)}</span>
                </div>
                <div className="record-meta">収入 {yen(row.income)}</div>
                <div style={{ height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                  <div style={{ width: incomeWidth, height: "100%", background: "#0f766e" }} />
                </div>
                <div className="record-meta">支出 {yen(row.expense)}</div>
                <div style={{ height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                  <div style={{ width: expenseWidth, height: "100%", background: "#b91c1c" }} />
                </div>
                <div className="record-meta">収支 {yen(row.net)}</div>
                <div style={{ height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                  <div style={{ width: netWidth, height: "100%", background: row.net < 0 ? "#b91c1c" : "#1d4ed8" }} />
                </div>
              </div>
            );
          })}
          {!loading && (data?.months.length ?? 0) === 0 ? <p className="record-meta">データがありません。</p> : null}
        </div>
      </section>

      <div className="report-grid-wrap">
        <table className="report-grid" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>月</th>
              <th>収入</th>
              <th>支出</th>
              <th>収支</th>
              <th>件数</th>
            </tr>
          </thead>
          <tbody>
            {(data?.months ?? []).map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td>{yen(row.income)}</td>
                <td>{yen(row.expense)}</td>
                <td className={row.net < 0 ? "status-fail" : "status-success"}>{yen(row.net)}</td>
                <td>{row.rowCount.toLocaleString("ja-JP")}件</td>
              </tr>
            ))}
            {!loading && (data?.months.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="record-meta">
                  データがありません。期間を指定して読み込みしてください。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

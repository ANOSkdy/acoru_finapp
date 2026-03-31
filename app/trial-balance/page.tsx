"use client";

import { useMemo, useState } from "react";
import DataGridShell from "../components/grid/DataGridShell";
import GridEmptyState from "../components/grid/GridEmptyState";
import GridToolbar from "../components/grid/GridToolbar";
import PageHeader from "../components/page/PageHeader";
import StatusMessage from "../components/ui/StatusMessage";

type TrialBalanceRow = {
  account_code: string | null;
  account_name: string;
  period_debit: string;
  period_credit: string;
  balance_side: "debit" | "credit";
  balance_amount: string;
  mapping_status: "mapped" | "unmapped" | "manual_override";
};

type TrialBalanceResponse = {
  ok: boolean;
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  error?: { message?: string };
};

function defaultFromDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.debit += Number(row.period_debit || 0);
          acc.credit += Number(row.period_credit || 0);
          return acc;
        },
        { debit: 0, credit: 0 }
      ),
    [rows]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ from, to });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/reports/trial-balance?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as TrialBalanceResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      setRows(json.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-layout">
      <PageHeader title="試算表" subtitle="期間指定で試算表を読み込みます。" />

      <GridToolbar>
        <div className="record-controls">
          <label>
            <div className="record-meta">from</div>
            <input className="record-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <div className="record-meta">to</div>
            <input className="record-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <div className="record-meta">科目検索</div>
            <input className="record-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="科目コード/科目名" />
          </label>
          <button className="btn" type="button" onClick={load} disabled={loading}>
            {loading ? "読込中..." : "読み込み"}
          </button>
        </div>
      </GridToolbar>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <StatusMessage>
        借方合計: {total.debit.toLocaleString("ja-JP")} / 貸方合計: {total.credit.toLocaleString("ja-JP")}
      </StatusMessage>

      <DataGridShell minWidth={820}>
        <table className="report-grid">
          <thead>
            <tr>
              <th>科目コード</th>
              <th>科目名</th>
              <th>当期借方</th>
              <th>当期貸方</th>
              <th>残高区分</th>
              <th>残高</th>
              <th>マッピング</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.account_code ?? "unmapped"}:${row.account_name}`}>
                <td>{row.account_code ?? "-"}</td>
                <td>{row.account_name}</td>
                <td>{Number(row.period_debit ?? 0).toLocaleString("ja-JP")}</td>
                <td>{Number(row.period_credit ?? 0).toLocaleString("ja-JP")}</td>
                <td>{row.balance_side === "debit" ? "借方" : "貸方"}</td>
                <td>{Number(row.balance_amount ?? 0).toLocaleString("ja-JP")}</td>
                <td>{row.mapping_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataGridShell>
      {rows.length === 0 ? <GridEmptyState message="データがありません。期間を指定して読み込みしてください。" /> : null}
    </section>
  );
}

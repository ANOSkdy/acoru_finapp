"use client";

import { useMemo, useState } from "react";

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
    <section style={{ display: "grid", gap: 12 }}>
      <h2>試算表</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label>
          <div className="record-meta">from</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <div className="record-meta">to</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ minWidth: 220 }}>
          <div className="record-meta">科目検索</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="科目コード/科目名"
            style={{ width: "100%" }}
          />
        </label>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "読込中..." : "読み込み"}
        </button>
      </div>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <div className="record-meta">
        借方合計: {total.debit.toLocaleString("ja-JP")} / 貸方合計: {total.credit.toLocaleString("ja-JP")}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="record-table" style={{ minWidth: 820 }}>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="record-meta">
                  データがありません。期間を指定して読み込みしてください。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.account_code ?? "unmapped"}:${row.account_name}`}>
                  <td>{row.account_code ?? "-"}</td>
                  <td>{row.account_name}</td>
                  <td>{Number(row.period_debit ?? 0).toLocaleString("ja-JP")}</td>
                  <td>{Number(row.period_credit ?? 0).toLocaleString("ja-JP")}</td>
                  <td>{row.balance_side === "debit" ? "借方" : "貸方"}</td>
                  <td>{Number(row.balance_amount ?? 0).toLocaleString("ja-JP")}</td>
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

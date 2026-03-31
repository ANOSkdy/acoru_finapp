"use client";

import { useEffect, useState } from "react";

type JournalRow = {
  journal_uuid: string;
  journal_number: string | number;
  transaction_date: string;
  description: string | null;
  source_type: string;
  status: string;
  total_debit: string;
  total_credit: string;
  line_count: number;
};

export default function JournalsPage() {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/journals?limit=50&offset=0", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; rows?: JournalRow[]; error?: { message?: string } };
        if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
        setRows(json.rows ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main>
      <h2 className="page-title">Journals</h2>
      <p className="page-subtitle">複合仕訳モデル（Phase 5）確認用の最小一覧です。</p>

      {loading ? <p className="record-meta">Loading...</p> : null}
      {error ? <p style={{ color: "crimson" }}>Error: {error}</p> : null}

      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>No</th>
              <th>取引日</th>
              <th>摘要</th>
              <th>借方合計</th>
              <th>貸方合計</th>
              <th>行数</th>
              <th>source</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.journal_uuid}>
                <td>{row.journal_number}</td>
                <td>{String(row.transaction_date).slice(0, 10)}</td>
                <td>{row.description ?? ""}</td>
                <td>{row.total_debit}</td>
                <td>{row.total_credit}</td>
                <td>{row.line_count}</td>
                <td>{row.source_type}</td>
                <td>{row.status}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="record-meta">
                  データがありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

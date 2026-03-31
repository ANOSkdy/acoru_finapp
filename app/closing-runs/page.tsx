"use client";

import { useCallback, useEffect, useState } from "react";
import DataGridShell from "../components/grid/DataGridShell";
import GridEmptyState from "../components/grid/GridEmptyState";
import GridToolbar from "../components/grid/GridToolbar";
import PageHeader from "../components/page/PageHeader";
import StatusMessage from "../components/ui/StatusMessage";

type FiscalPeriod = { period_id: string; fiscal_year: number; period_name: string };
type ClosingRun = {
  closing_run_id: string;
  run_status: "started" | "completed" | "failed" | "rolled_back";
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export default function ClosingRunsPage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [runStatus, setRunStatus] = useState<ClosingRun["run_status"]>("started");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ClosingRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/fiscal-periods", { cache: "no-store" });
      const json = (await res.json()) as { rows?: FiscalPeriod[] };
      setPeriods(json.rows ?? []);
      if (json.rows?.[0]?.period_id) setPeriodId(json.rows[0].period_id);
    }

    init().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (periodId) sp.set("fiscal_period_id", periodId);

    const res = await fetch(`/api/closing-runs?${sp.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; rows?: ClosingRun[]; error?: { message?: string } };
    if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    setRows(json.rows ?? []);
  }, [periodId]);

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  async function createRun() {
    try {
      const res = await fetch("/api/closing-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscal_period_id: periodId, run_status: runStatus, notes }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setNotes("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="page-layout">
      <PageHeader title="締め処理ログ" subtitle="会計期間ごとの締め処理状態を記録・確認します。" />

      <GridToolbar>
        <div className="record-controls">
          <label>
            <div className="record-meta">会計期間</div>
            <select className="record-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.period_id} value={p.period_id}>{`${p.fiscal_year}-${p.period_name}`}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="record-meta">ステータス</div>
            <select className="record-select" value={runStatus} onChange={(e) => setRunStatus(e.target.value as ClosingRun["run_status"])}>
              <option value="started">started</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="rolled_back">rolled_back</option>
            </select>
          </label>

          <label>
            <div className="record-meta">メモ</div>
            <input className="record-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button className="btn" type="button" onClick={createRun}>記録</button>
        </div>
      </GridToolbar>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <DataGridShell minWidth={840}>
        <table className="report-grid">
          <thead>
            <tr>
              <th>作成日時</th>
              <th>ステータス</th>
              <th>メモ</th>
              <th>完了日時</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.closing_run_id}>
                <td>{String(r.created_at).slice(0, 19).replace("T", " ")}</td>
                <td>{r.run_status}</td>
                <td>{r.notes ?? ""}</td>
                <td>{r.completed_at ? String(r.completed_at).slice(0, 19).replace("T", " ") : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataGridShell>
      {rows.length === 0 ? <GridEmptyState message="締め処理ログがありません。" /> : null}
    </section>
  );
}

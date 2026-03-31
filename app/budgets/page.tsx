"use client";

import { useCallback, useEffect, useState } from "react";
import DataGridShell from "../components/grid/DataGridShell";
import GridEmptyState from "../components/grid/GridEmptyState";
import GridToolbar from "../components/grid/GridToolbar";
import PageHeader from "../components/page/PageHeader";
import StatusMessage from "../components/ui/StatusMessage";

type FiscalPeriod = { period_id: string; fiscal_year: number; period_name: string };
type Department = { department_id: string; code: string; name: string };
type Project = { project_id: string; code: string; name: string };
type Account = { account_code: string; account_name: string };
type Budget = {
  budget_id: string;
  account_code: string;
  department_code: string | null;
  department_name: string | null;
  project_code: string | null;
  project_name: string | null;
  budget_amount: string;
};
type Variance = Budget & { actual_amount: string; variance_amount: string; actual_source: string };

export default function BudgetsPage() {
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fiscalPeriodId, setFiscalPeriodId] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("0");
  const [rows, setRows] = useState<Budget[]>([]);
  const [varianceRows, setVarianceRows] = useState<Variance[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const [fpRes, acRes, depRes, projRes] = await Promise.all([
        fetch("/api/fiscal-periods", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/departments", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);

      const fpJson = (await fpRes.json()) as { rows?: FiscalPeriod[] };
      const acJson = (await acRes.json()) as { rows?: Account[] };
      const depJson = (await depRes.json()) as { rows?: Department[] };
      const projJson = (await projRes.json()) as { rows?: Project[] };

      setFiscalPeriods(fpJson.rows ?? []);
      setAccounts(acJson.rows ?? []);
      setDepartments(depJson.rows ?? []);
      setProjects(projJson.rows ?? []);

      if (fpJson.rows?.[0]?.period_id) setFiscalPeriodId(fpJson.rows[0].period_id);
      if (acJson.rows?.[0]?.account_code) setAccountCode(acJson.rows[0].account_code);
    }

    init().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const load = useCallback(async () => {
    if (!fiscalPeriodId) return;

    const sp = new URLSearchParams({ fiscal_period_id: fiscalPeriodId });

    const res = await fetch(`/api/budgets?${sp.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; rows?: Budget[]; error?: { message?: string } };
    if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    setRows(json.rows ?? []);

    const varRes = await fetch(`/api/budgets/variance?${sp.toString()}`, { cache: "no-store" });
    const varJson = (await varRes.json()) as {
      ok?: boolean;
      rows?: Variance[];
      error?: { message?: string };
    };
    if (!varRes.ok || !varJson.ok) throw new Error(varJson.error?.message ?? `HTTP ${varRes.status}`);
    setVarianceRows(varJson.rows ?? []);
  }, [fiscalPeriodId]);

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  async function createBudget() {
    setError(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscal_period_id: fiscalPeriodId,
          account_code: accountCode,
          department_id: departmentId || null,
          project_id: projectId || null,
          budget_amount: Number(budgetAmount || 0),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="page-layout">
      <PageHeader title="予算管理" subtitle="部門・プロジェクト別の予算と予実差異を管理します。" />

      <GridToolbar>
        <div className="record-controls">
          <label>
            <div className="record-meta">会計期間</div>
            <select className="record-select" value={fiscalPeriodId} onChange={(e) => setFiscalPeriodId(e.target.value)}>
              {fiscalPeriods.map((p) => (
                <option key={p.period_id} value={p.period_id}>{`${p.fiscal_year}-${p.period_name}`}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="record-meta">科目</div>
            <select className="record-select" value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{`${a.account_code} ${a.account_name}`}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="record-meta">部門</div>
            <select className="record-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">(なし)</option>
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>{`${d.code} ${d.name}`}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="record-meta">PJ</div>
            <select className="record-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">(なし)</option>
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>{`${p.code} ${p.name}`}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="record-meta">予算額</div>
            <input className="record-input" inputMode="numeric" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
          </label>

          <button className="btn" type="button" onClick={createBudget}>登録</button>
        </div>
      </GridToolbar>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <h3 className="section-title">予算一覧</h3>
      <DataGridShell minWidth={860}>
        <table className="report-grid">
          <thead>
            <tr>
              <th>科目</th>
              <th>部門</th>
              <th>PJ</th>
              <th>予算額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.budget_id}>
                <td>{r.account_code}</td>
                <td>{r.department_code ? `${r.department_code} ${r.department_name}` : "-"}</td>
                <td>{r.project_code ? `${r.project_code} ${r.project_name}` : "-"}</td>
                <td>{Number(r.budget_amount).toLocaleString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataGridShell>
      {rows.length === 0 ? <GridEmptyState message="予算データがありません。" /> : null}

      <h3 className="section-title">予実差異</h3>
      <DataGridShell minWidth={980}>
        <table className="report-grid">
          <thead>
            <tr>
              <th>科目</th>
              <th>部門</th>
              <th>PJ</th>
              <th>予算</th>
              <th>実績</th>
              <th>差異</th>
              <th>実績ソース</th>
            </tr>
          </thead>
          <tbody>
            {varianceRows.map((r) => (
              <tr key={r.budget_id}>
                <td>{r.account_code}</td>
                <td>{r.department_code ? `${r.department_code} ${r.department_name}` : "-"}</td>
                <td>{r.project_code ? `${r.project_code} ${r.project_name}` : "-"}</td>
                <td>{Number(r.budget_amount).toLocaleString("ja-JP")}</td>
                <td>{Number(r.actual_amount).toLocaleString("ja-JP")}</td>
                <td>{Number(r.variance_amount).toLocaleString("ja-JP")}</td>
                <td>{r.actual_source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataGridShell>
      {varianceRows.length === 0 ? <GridEmptyState message="予実差異データがありません。" /> : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import DataGridShell from "../components/grid/DataGridShell";
import GridToolbar from "../components/grid/GridToolbar";
import PageHeader from "../components/page/PageHeader";
import StatusMessage from "../components/ui/StatusMessage";

type Department = { department_id: string; code: string; name: string; is_active: boolean; created_at: string };

export default function DepartmentsPage() {
  const [rows, setRows] = useState<Department[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() { const res = await fetch('/api/departments', { cache: 'no-store' }); const json = (await res.json()) as { ok?: boolean; rows?: Department[]; error?: { message?: string } }; if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`); setRows(json.rows ?? []); }
  useEffect(() => { load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, []);
  async function createRow() { setError(null); try { const res = await fetch('/api/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, is_active: isActive }) }); const json = (await res.json()) as { ok?: boolean; error?: { message?: string } }; if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`); setCode(''); setName(''); setIsActive(true); await load(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } }
  return <section className="page-layout"><PageHeader title="部門マスタ" subtitle="部門コードと名称を管理します。" /><GridToolbar><div className="record-controls"><label><div className="record-meta">コード</div><input className="record-input" value={code} onChange={(e) => setCode(e.target.value)} /></label><label><div className="record-meta">名称</div><input className="record-input" value={name} onChange={(e) => setName(e.target.value)} /></label><label><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> 有効</label><button className="btn" type="button" onClick={createRow}>作成</button></div></GridToolbar>{error ? <StatusMessage tone="error">{error}</StatusMessage> : null}<DataGridShell minWidth={680}><table className="report-grid"><thead><tr><th>コード</th><th>名称</th><th>有効</th><th>作成日時</th></tr></thead><tbody>{rows.map((r)=><tr key={r.department_id}><td>{r.code}</td><td>{r.name}</td><td>{r.is_active ? '有効' : '無効'}</td><td>{String(r.created_at).slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table></DataGridShell></section>;
}

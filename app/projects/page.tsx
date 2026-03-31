"use client";

import { useEffect, useState } from "react";

type Project = { project_id: string; code: string; name: string; is_active: boolean; created_at: string };

export default function ProjectsPage() {
  const [rows, setRows] = useState<Project[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/projects", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; rows?: Project[]; error?: { message?: string } };
    if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    setRows(json.rows ?? []);
  }

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function createRow() {
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, is_active: isActive }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setCode("");
      setName("");
      setIsActive(true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2>プロジェクトマスタ</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label><div className="record-meta">コード</div><input value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label><div className="record-meta">名称</div><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> 有効</label>
        <button type="button" onClick={createRow}>作成</button>
      </div>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table className="record-table" style={{ minWidth: 680 }}>
          <thead><tr><th>コード</th><th>名称</th><th>有効</th><th>作成日時</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.project_id}><td>{r.code}</td><td>{r.name}</td><td>{r.is_active ? "有効" : "無効"}</td><td>{String(r.created_at).slice(0, 19).replace("T", " ")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_amount: string;
  debit_tax: string;
  credit_account: string;
  credit_amount: string;
  description: string | null;
  memo: string | null;
  drive_file_id: string | null;
  created_at: string;
};

type ListResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  rows: LedgerRow[];
  error?: { message: string };
};

type Draft = {
  transaction_date: string;
  debit_account: string;
  debit_vendor: string;
  debit_amount: string;
  debit_tax: string;
  credit_account: string;
  credit_amount: string;
  description: string;
  memo: string;
};

function toDateInputValue(v: string) {
  if (!v) return "";
  return v.includes("T") ? v.slice(0, 10) : v;
}

function toInt(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export default function RecordEditPage() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    return sp.toString();
  }, [q, limit, offset]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ledger?${queryString}`, { cache: "no-store" });
      const json = (await res.json()) as ListResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      setRows(json.rows);
      setTotal(json.total);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  function startEdit(r: LedgerRow) {
    setEditingId(r.journal_id);
    setDraft({
      transaction_date: toDateInputValue(r.transaction_date),
      debit_account: r.debit_account ?? "",
      debit_vendor: r.debit_vendor ?? "",
      debit_amount: r.debit_amount ?? "0",
      debit_tax: r.debit_tax ?? "0",
      credit_account: r.credit_account ?? "",
      credit_amount: r.credit_amount ?? "0",
      description: r.description ?? "",
      memo: r.memo ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(journalId: string) {
    if (!draft) return;

    setLoading(true);
    setErr(null);

    try {
      const payload = {
        transaction_date: draft.transaction_date,
        debit_account: draft.debit_account,
        debit_vendor: draft.debit_vendor,
        debit_amount: toInt(draft.debit_amount),
        debit_tax: toInt(draft.debit_tax),
        credit_account: draft.credit_account,
        credit_amount: toInt(draft.credit_amount),
        description: draft.description,
        memo: draft.memo,
      };

      const res = await fetch(`/api/ledger/${journalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({} as { ok?: boolean; error?: { message?: string } }));
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);

      cancelEdit();
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteRow(journalId: string) {
    const ok = confirm(`journal_id=${journalId} を削除しますか？（元に戻せません）`);
    if (!ok) return;

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ledger/${journalId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({} as { ok?: boolean; error?: { message?: string } }));
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 12 }}>
      <h1>Record Edit (expense_ledger)</h1>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
          placeholder="検索（仕訳ID/店名/科目/摘要/メモ/receipt_idなど）"
          style={{ minWidth: 320, padding: 8 }}
        />

        <select
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setOffset(0);
          }}
          style={{ padding: 8 }}
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>

        <button disabled={loading} onClick={() => load()} style={{ padding: "8px 12px" }}>
          再読み込み
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            disabled={loading || !canPrev}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            style={{ padding: "8px 12px" }}
          >
            前へ
          </button>
          <span>
            {total === 0 ? "0" : `${offset + 1}-${Math.min(offset + limit, total)}`} / {total}
          </span>
          <button
            disabled={loading || !canNext}
            onClick={() => setOffset(offset + limit)}
            style={{ padding: "8px 12px" }}
          >
            次へ
          </button>
        </div>
      </section>

      {err ? <p style={{ color: "crimson" }}>Error: {err}</p> : null}
      {loading ? <p>Loading...</p> : null}

      <div style={{ overflowX: "auto" }}>
        <table cellPadding={8} style={{ borderCollapse: "collapse", minWidth: 1200 }}>
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              <th>仕訳ID</th>
              <th>取引日</th>
              <th>借方科目</th>
              <th>取引先</th>
              <th>金額</th>
              <th>摘要</th>
              <th>メモ</th>
              <th>receipt_id</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editingId === r.journal_id;

              return (
                <tr key={r.journal_id} style={{ borderTop: "1px solid #ddd" }}>
                  <td>{r.journal_id}</td>

                  <td>
                    {isEditing ? (
                      <input
                        value={draft?.transaction_date ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, transaction_date: e.target.value } : d))
                        }
                        style={{ width: 120 }}
                      />
                    ) : (
                      toDateInputValue(r.transaction_date)
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={draft?.debit_account ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, debit_account: e.target.value } : d))
                        }
                        style={{ width: 140 }}
                      />
                    ) : (
                      r.debit_account
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={draft?.debit_vendor ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, debit_vendor: e.target.value } : d))
                        }
                        style={{ width: 180 }}
                      />
                    ) : (
                      r.debit_vendor ?? ""
                    )}
                  </td>

                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <input
                        value={draft?.debit_amount ?? "0"}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, debit_amount: e.target.value } : d))
                        }
                        style={{ width: 120, textAlign: "right" }}
                        inputMode="numeric"
                      />
                    ) : (
                      r.debit_amount
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={draft?.description ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, description: e.target.value } : d))
                        }
                        style={{ width: 260 }}
                      />
                    ) : (
                      r.description ?? ""
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        value={draft?.memo ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, memo: e.target.value } : d))
                        }
                        style={{ width: 260 }}
                      />
                    ) : (
                      r.memo ?? ""
                    )}
                  </td>

                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.drive_file_id ?? ""}</td>

                  <td style={{ whiteSpace: "nowrap" }}>
                    {isEditing ? (
                      <>
                        <button disabled={loading} onClick={() => saveEdit(r.journal_id)} style={{ marginRight: 8 }}>
                          保存
                        </button>
                        <button disabled={loading} onClick={cancelEdit}>
                          キャンセル
                        </button>
                      </>
                    ) : (
                      <>
                        <button disabled={loading} onClick={() => startEdit(r)} style={{ marginRight: 8 }}>
                          編集
                        </button>
                        <button disabled={loading} onClick={() => deleteRow(r.journal_id)}>
                          削除
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 16, color: "#666" }}>
                  レコードがありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
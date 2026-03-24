"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  journal_id: string;
  transaction_date: string;
  debit_account: string;
  debit_vendor: string | null;
  debit_tax: string | number | null;
  debit_amount: string | number | null;
  credit_account: string | null;
  credit_amount: string | number | null;
  description: string | null;
  memo: string | null;
};

type SortBy =
  | "journal_id"
  | "transaction_date"
  | "debit_account"
  | "debit_vendor"
  | "debit_tax"
  | "debit_amount"
  | "credit_account"
  | "credit_amount"
  | "description"
  | "memo"
  | "created_at";

type SortOrder = "asc" | "desc";

type EditableField =
  | "transaction_date"
  | "debit_account"
  | "debit_vendor"
  | "debit_tax"
  | "debit_amount"
  | "credit_account"
  | "credit_amount"
  | "description"
  | "memo";

type ListResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  rows: LedgerRow[];
  error?: { message: string };
};

type CreateResponse = {
  ok: boolean;
  journal_id?: string;
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

type EditingCell = {
  journalId: string;
  field: EditableField;
};

const PAGE_SIZE = 100;
const EDITABLE_FIELDS: EditableField[] = [
  "transaction_date",
  "debit_account",
  "debit_vendor",
  "debit_tax",
  "debit_amount",
  "credit_account",
  "credit_amount",
  "description",
  "memo",
];
const NUMERIC_FIELDS = new Set<EditableField>(["debit_tax", "debit_amount", "credit_amount"]);

const COLUMNS: Array<{ key: SortBy; label: string; editable?: EditableField }> = [
  { key: "journal_id", label: "仕訳ID" },
  { key: "transaction_date", label: "取引日", editable: "transaction_date" },
  { key: "debit_account", label: "借方科目", editable: "debit_account" },
  { key: "debit_vendor", label: "取引先", editable: "debit_vendor" },
  { key: "debit_tax", label: "借方税額", editable: "debit_tax" },
  { key: "debit_amount", label: "借方金額", editable: "debit_amount" },
  { key: "credit_account", label: "貸方科目", editable: "credit_account" },
  { key: "credit_amount", label: "貸方金額", editable: "credit_amount" },
  { key: "description", label: "摘要", editable: "description" },
  { key: "memo", label: "メモ", editable: "memo" },
];

function toDateInputValue(v: string) {
  if (!v) return "";
  return v.includes("T") ? v.slice(0, 10) : v;
}

function toCellValue(row: LedgerRow, field: EditableField) {
  const value = row[field];
  if (field === "transaction_date") return toDateInputValue(String(value ?? ""));
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function toPatchValue(field: EditableField, value: string) {
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("数値形式で入力してください。");
    return Math.max(0, Math.trunc(n));
  }
  return value;
}

export default function RecordListsPage() {
  const [q, setQ] = useState("");
  const [limit] = useState(PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("transaction_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    transaction_date: new Date().toISOString().slice(0, 10),
    debit_account: "雑費",
    debit_vendor: "",
    debit_amount: "0",
    debit_tax: "0",
    credit_account: "未払金",
    credit_amount: "0",
    description: "",
    memo: "",
  });

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    sp.set("sortBy", sortBy);
    sp.set("sortOrder", sortOrder);
    return sp.toString();
  }, [q, limit, offset, sortBy, sortOrder]);

  function toInt(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  function resetDraft() {
    setDraft({
      transaction_date: new Date().toISOString().slice(0, 10),
      debit_account: "雑費",
      debit_vendor: "",
      debit_amount: "0",
      debit_tax: "0",
      credit_account: "未払金",
      credit_amount: "0",
      description: "",
      memo: "",
    });
    setCreateErr(null);
  }

  function startEdit(row: LedgerRow, field: EditableField) {
    setStatus(null);
    setErr(null);
    setEditingCell({ journalId: row.journal_id, field });
    setEditingValue(toCellValue(row, field));
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditingValue("");
  }

  async function saveCell() {
    if (!editingCell) return;

    const { journalId, field } = editingCell;
    const key = `${journalId}:${field}`;
    setSavingCell(key);
    setErr(null);
    setStatus(null);

    try {
      const payload: Record<string, string | number> = {
        [field]: toPatchValue(field, editingValue),
      };

      const res = await fetch(`/api/ledger/${journalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setRows((prev) =>
        prev.map((row) => (row.journal_id === journalId ? { ...row, [field]: payload[field] } : row))
      );
      setStatus("更新しました。");
      cancelEdit();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCell(null);
    }
  }

  async function createRecord() {
    setCreating(true);
    setCreateErr(null);
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

      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({} as CreateResponse))) as CreateResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setShowCreateModal(false);
      resetDraft();
      setOffset(0);
      await load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

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

  function toggleSort(column: SortBy) {
    setOffset(0);
    setEditingCell(null);
    setSortBy((prev) => {
      if (prev !== column) {
        setSortOrder("asc");
        return column;
      }
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return prev;
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <main>
      <h2 className="page-title">Record Lists</h2>
      <p className="page-subtitle">仕訳を一覧で確認し、セルをダブルクリックして編集します。</p>

      <div className="record-toolbar">
        <div className="record-actions">
          <button
            className="btn"
            onClick={() => {
              resetDraft();
              setShowCreateModal(true);
            }}
          >
            新規登録
          </button>
        </div>

        <section className="record-controls">
          <input
            className="record-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="検索（仕訳ID/店名/科目/摘要/メモ/receipt_idなど）"
          />

          <span className="record-meta">100件/ページ固定</span>

          <div className="record-actions">
            <button
              className="btn btn-secondary"
              disabled={loading || !canPrev}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              前へ
            </button>
            <span className="record-meta">
              {total === 0 ? "0" : `${offset + 1}-${Math.min(offset + limit, total)}`} / {total}
            </span>
            <button
              className="btn btn-secondary"
              disabled={loading || !canNext}
              onClick={() => setOffset(offset + limit)}
            >
              次へ
            </button>
          </div>
        </section>
      </div>

      {err ? <p style={{ color: "crimson" }}>Error: {err}</p> : null}
      {status ? <p className="status-success">{status}</p> : null}
      {loading ? <p className="record-meta">Loading...</p> : null}

      <div className="record-table-wrap">
        <table className="record-grid" aria-label="仕訳一覧">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = sortBy === column.key;
                const mark = active ? (sortOrder === "asc" ? "▲" : "▼") : "";
                return (
                  <th key={column.key}>
                    <button
                      type="button"
                      className={`record-sort-btn${active ? " active" : ""}`}
                      onClick={() => toggleSort(column.key)}
                      aria-label={`${column.label}で並び替え`}
                    >
                      <span>{column.label}</span>
                      <span className="record-sort-mark">{mark}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.journal_id} className="record-grid-row" aria-label={`仕訳ID ${r.journal_id}`}>
                {COLUMNS.map((column) => {
                  const field = column.editable;
                  const isEditing =
                    field && editingCell?.journalId === r.journal_id && editingCell.field === field;
                  const saving = savingCell === `${r.journal_id}:${field}`;

                  if (!field) {
                    return <td key={column.key}>{r.journal_id}</td>;
                  }

                  return (
                    <td
                      key={column.key}
                      onDoubleClick={() => {
                        if (EDITABLE_FIELDS.includes(field)) {
                          startEdit(r, field);
                        }
                      }}
                    >
                      {isEditing ? (
                        <div className="record-inline-edit">
                          {field === "description" || field === "memo" ? (
                            <textarea
                              className="record-input"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              rows={2}
                              autoFocus
                            />
                          ) : (
                            <input
                              className="record-input"
                              type={field === "transaction_date" ? "date" : "text"}
                              inputMode={NUMERIC_FIELDS.has(field) ? "numeric" : undefined}
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveCell();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                            />
                          )}
                          <div className="record-inline-actions">
                            <button className="btn" disabled={saving} onClick={() => void saveCell()}>
                              保存
                            </button>
                            <button className="btn btn-secondary" disabled={saving} onClick={cancelEdit}>
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="record-cell-value">
                          {field === "transaction_date"
                            ? toDateInputValue(String(r[field] ?? "")) || "-"
                            : r[field] ?? "-"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="record-card">レコードがありません</div> : null}

      {showCreateModal ? (
        <div className="record-modal-overlay" role="dialog" aria-modal="true" aria-label="仕訳新規登録">
          <div className="record-modal">
            <h3 className="page-title" style={{ marginBottom: 4 }}>
              新規レコード登録
            </h3>
            <p className="record-meta">既存レコード編集と同じ項目で登録できます。</p>

            {createErr ? <p className="status-fail">Error: {createErr}</p> : null}

            <div className="record-field">
              <span className="record-label">取引日</span>
              <input
                className="record-input"
                value={draft.transaction_date}
                onChange={(e) => setDraft((d) => ({ ...d, transaction_date: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方科目</span>
              <input
                className="record-input"
                value={draft.debit_account}
                onChange={(e) => setDraft((d) => ({ ...d, debit_account: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">取引先</span>
              <input
                className="record-input"
                value={draft.debit_vendor}
                onChange={(e) => setDraft((d) => ({ ...d, debit_vendor: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方税額</span>
              <input
                className="record-input"
                value={draft.debit_tax}
                onChange={(e) => setDraft((d) => ({ ...d, debit_tax: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">借方金額</span>
              <input
                className="record-input"
                value={draft.debit_amount}
                onChange={(e) => setDraft((d) => ({ ...d, debit_amount: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方科目</span>
              <input
                className="record-input"
                value={draft.credit_account}
                onChange={(e) => setDraft((d) => ({ ...d, credit_account: e.target.value }))}
              />
            </div>
            <div className="record-field">
              <span className="record-label">貸方金額</span>
              <input
                className="record-input"
                value={draft.credit_amount}
                onChange={(e) => setDraft((d) => ({ ...d, credit_amount: e.target.value }))}
                inputMode="numeric"
              />
            </div>
            <div className="record-field">
              <span className="record-label">摘要</span>
              <textarea
                className="record-input"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="record-field">
              <span className="record-label">メモ</span>
              <textarea
                className="record-input"
                value={draft.memo}
                onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="record-actions">
              <button className="btn" disabled={creating} onClick={createRecord}>
                登録
              </button>
              <button
                className="btn btn-secondary"
                disabled={creating}
                onClick={() => {
                  setShowCreateModal(false);
                  resetDraft();
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

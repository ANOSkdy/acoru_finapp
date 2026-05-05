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
  journal_id?: string | number;
  row?: LedgerRow;
  error?: { message: string };
};

type Draft = {
  temp_id: string;
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

function currentFiscalYearFromMonth() {
  const year = new Date().getFullYear();
  return `${year}-01`;
}

function currentFiscalYearToMonth() {
  const year = new Date().getFullYear();
  return `${year}-12`;
}

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
  const [from, setFrom] = useState(() => currentFiscalYearFromMonth());
  const [to, setTo] = useState(() => currentFiscalYearToMonth());
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftRow, setDraftRow] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const selectedCount = selectedIds.size;
  const selectableRowIds = useMemo(() => rows.map((r) => r.journal_id), [rows]);
  const allSelected = selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIds.has(id));

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    sp.set("sortBy", sortBy);
    sp.set("sortOrder", sortOrder);
    return sp.toString();
  }, [q, from, to, limit, offset, sortBy, sortOrder]);

  function resetFiscalYearFilter() {
    setFrom(currentFiscalYearFromMonth());
    setTo(currentFiscalYearToMonth());
    setOffset(0);
  }

  function toInt(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  function makeDraft(): Draft {
    return {
      temp_id: `draft-${Date.now()}`,
      transaction_date: new Date().toISOString().slice(0, 10),
      debit_account: "雑費",
      debit_vendor: "",
      debit_amount: "0",
      debit_tax: "0",
      credit_account: "未払金",
      credit_amount: "0",
      description: "",
      memo: "",
    };
  }

  function resetDraft() {
    setDraftRow(makeDraft());
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
    if (!draftRow) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const payload = {
        transaction_date: draftRow.transaction_date,
        debit_account: draftRow.debit_account,
        debit_vendor: draftRow.debit_vendor,
        debit_amount: toInt(draftRow.debit_amount),
        debit_tax: toInt(draftRow.debit_tax),
        credit_account: draftRow.credit_account,
        credit_amount: toInt(draftRow.credit_amount),
        description: draftRow.description,
        memo: draftRow.memo,
      };

      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({} as CreateResponse))) as CreateResponse;
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setDraftRow(null);
      setOffset(0);
      await load();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function deleteSelectedRows() {
    if (selectedCount === 0) return;
    const ok = confirm(`${selectedCount}件の仕訳を削除しますか？（元に戻せません）`);
    if (!ok) return;

    setDeleting(true);
    setErr(null);
    setStatus(null);
    try {
      const journalIds = Array.from(selectedIds).map((id) => Number(id)).filter(Number.isFinite);
      const res = await fetch("/api/ledger", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalIds }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);

      setRows((prev) => prev.filter((row) => !selectedIds.has(row.journal_id)));
      setSelectedIds(new Set());
      setTotal((prev) => Math.max(0, prev - journalIds.length));
      setStatus("削除しました。");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
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
      setSelectedIds((prev) => {
        const next = new Set<string>();
        const currentIds = new Set(json.rows.map((r) => r.journal_id));
        prev.forEach((id) => {
          if (currentIds.has(id)) next.add(id);
        });
        return next;
      });
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
        <section className="record-controls">
          <button
            className="btn"
            style={{ minWidth: 88, whiteSpace: "nowrap" }}
            onClick={() => {
              if (!draftRow) resetDraft();
            }}
            disabled={Boolean(draftRow)}
          >
            新規
          </button>
          <button
            className="btn btn-secondary"
            style={{ minWidth: 88, whiteSpace: "nowrap" }}
            onClick={() => void deleteSelectedRows()}
            disabled={deleting || selectedCount === 0}
          >
            削除
          </button>

          <label className="report-toolbar-field" style={{ minWidth: 180 }}>
            <span className="record-meta">from</span>
            <input
              className="record-input"
              type="month"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="report-toolbar-field" style={{ minWidth: 180 }}>
            <span className="record-meta">to</span>
            <input
              className="record-input"
              type="month"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <button
            className="btn btn-secondary"
            type="button"
            style={{ minWidth: 88, whiteSpace: "nowrap" }}
            onClick={resetFiscalYearFilter}
          >
            今年
          </button>

          <input
            className="record-input"
            style={{ flex: "1 1 280px", minWidth: 220 }}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="検索（仕訳ID/店名/科目/摘要/メモ/receipt_idなど）"
          />

          <span className="record-meta" style={{ whiteSpace: "nowrap" }}>
            100件/ページ固定
          </span>

          <div className="record-actions record-actions-pager">
            <button
              className="btn btn-secondary"
              style={{ minWidth: 72, whiteSpace: "nowrap" }}
              disabled={loading || !canPrev}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              前へ
            </button>
            <span className="record-meta" style={{ whiteSpace: "nowrap" }}>
              {total === 0 ? "0" : `${offset + 1}-${Math.min(offset + limit, total)}`} / {total}
            </span>
            <button
              className="btn btn-secondary"
              style={{ minWidth: 72, whiteSpace: "nowrap" }}
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
              <th className="record-check-col">
                <input
                  type="checkbox"
                  aria-label="全選択"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(selectableRowIds));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </th>
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
            {draftRow ? (
              <tr className="record-grid-row record-grid-row-draft" aria-label="新規下書き行">
                <td className="record-check-col" />
                <td>新規</td>
                <td>
                  <input
                    className="record-input"
                    type="date"
                    value={draftRow.transaction_date}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, transaction_date: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    value={draftRow.debit_account}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, debit_account: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    value={draftRow.debit_vendor}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, debit_vendor: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    inputMode="numeric"
                    value={draftRow.debit_tax}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, debit_tax: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    inputMode="numeric"
                    value={draftRow.debit_amount}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, debit_amount: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    value={draftRow.credit_account}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, credit_account: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    inputMode="numeric"
                    value={draftRow.credit_amount}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, credit_amount: e.target.value } : d))}
                  />
                </td>
                <td>
                  <input
                    className="record-input"
                    value={draftRow.description}
                    onChange={(e) => setDraftRow((d) => (d ? { ...d, description: e.target.value } : d))}
                  />
                </td>
                <td>
                  <div className="record-inline-edit">
                    <input
                      className="record-input"
                      value={draftRow.memo}
                      onChange={(e) => setDraftRow((d) => (d ? { ...d, memo: e.target.value } : d))}
                    />
                    <div className="record-inline-actions">
                      <button className="btn" disabled={creating} onClick={() => void createRecord()}>
                        保存
                      </button>
                      <button className="btn btn-secondary" disabled={creating} onClick={() => setDraftRow(null)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.journal_id} className="record-grid-row" aria-label={`仕訳ID ${r.journal_id}`}>
                <td className="record-check-col">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.journal_id)}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.journal_id);
                        else next.delete(r.journal_id);
                        return next;
                      });
                    }}
                    aria-label={`仕訳ID ${r.journal_id} を選択`}
                  />
                </td>
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
      {createErr ? <p className="status-fail">Error: {createErr}</p> : null}
    </main>
  );
}

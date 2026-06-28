'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, SlidersHorizontal, ChevronRight, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Skeleton } from '@/components/shadcn/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import { LabourDetailSheet } from './LabourDetailSheet';
import { ItemFormSheet } from './ItemFormSheet';
import { ConfirmModal } from '@/components/ui';
import type { LabourBandEntry, LabourDatabaseRow } from '@/types';
import { cn } from '@/lib/cn';

const HT_BANDS = ['Standard', 'Medium', 'High', 'Very High', 'Extra High', 'All'];

const SECTION_VARIANT: Record<string, 'success' | 'info' | 'warning'> = {
  Walls:    'success',
  Ceiling:  'info',
  Bulkhead: 'warning',
};

const HT_BAND_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'purple' | 'secondary'> = {
  Standard:    'success',
  Medium:      'info',
  High:        'warning',
  'Very High': 'warning',
  'Extra High':'purple',
  All:         'secondary',
};

function CodeChip({ value, dimmed }: { value: string; dimmed?: boolean }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <code className={cn(
      'text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap',
      dimmed ? 'bg-slate-100 text-slate-400 line-through' : 'bg-emerald-50 text-emerald-700',
    )}>
      {value}
    </code>
  );
}

function RateCell({ value }: { value: number }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs tabular-nums font-medium">
      <span className="text-muted-foreground text-[10px] mr-0.5">$</span>
      {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

// ─── Inline add-band form ─────────────────────────────────────────────────────

interface NewBandForm {
  labourCode: string;
  htBand: string;
  htMinFt: string;
  htMaxFt: string;
  uom: string;
  ratePerUom: string;
  description: string;
  notes: string;
}

function emptyBandForm(parentCode: string): NewBandForm {
  return {
    labourCode: parentCode ? `${parentCode}-` : '',
    htBand: 'Standard',
    htMinFt: '0',
    htMaxFt: '99',
    uom: '',
    ratePerUom: '',
    description: '',
    notes: '',
  };
}

// ─── Children table shown when a parent row is expanded ───────────────────────

interface ChildBandsTableProps {
  row: LabourDatabaseRow;
  onToggleBand: (bandLabourCode: string, newIsActive: boolean) => Promise<void>;
  onAddBand: (form: NewBandForm) => Promise<void>;
  onEditBand: (originalLabourCode: string, form: NewBandForm) => Promise<void>;
  onDeleteBand: (bandLabourCode: string) => Promise<void>;
}

function ChildBandsTable({ row, onToggleBand, onAddBand, onEditBand, onDeleteBand }: ChildBandsTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newBand, setNewBand] = useState<NewBandForm>(emptyBandForm(row.parentCode));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewBandForm>(emptyBandForm(row.parentCode));
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm state
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  function setBandField(field: keyof NewBandForm, value: string) {
    setNewBand((prev) => ({ ...prev, [field]: value }));
  }

  function setEditField(field: keyof NewBandForm, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(band: LabourBandEntry) {
    setEditingCode(band.labourCode);
    setEditForm({
      labourCode: band.labourCode,
      htBand: band.htBand,
      htMinFt: String(band.htMinFt),
      htMaxFt: String(band.htMaxFt),
      uom: band.uom,
      ratePerUom: String(band.ratePerUom),
      description: band.description || '',
      notes: band.notes || '',
    });
    setError(null);
    setIsAdding(false);
    setConfirmDeleteCode(null);
  }

  function cancelEdit() {
    setEditingCode(null);
    setError(null);
  }

  async function handleEditSave() {
    if (!editForm.labourCode.trim()) { setError('Child code is required'); return; }
    setEditSaving(true);
    setError(null);
    try {
      await onEditBand(editingCode!, editForm);
      setEditingCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggle(labourCode: string, currentIsActive: boolean) {
    setToggling(labourCode);
    try { await onToggleBand(labourCode, !currentIsActive); }
    finally { setToggling(null); }
  }

  async function handleSave() {
    if (!newBand.labourCode.trim()) { setError('Child code is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onAddBand(newBand);
      setIsAdding(false);
      setNewBand(emptyBandForm(row.parentCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm(labourCode: string) {
    setDeletingCode(labourCode);
    setError(null);
    try {
      await onDeleteBand(labourCode);
      setConfirmDeleteCode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingCode(null);
    }
  }

  const inputCls = 'w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500';
  const canDelete = row.labourBands.length > 1;

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="bg-slate-50 border-b border-slate-200 px-4 pb-3 pt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-1.5 w-7" />
                <th className="py-1.5 pl-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-36">Child Code</th>
                <th className="py-1.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-28">HT Band</th>
                <th className="py-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-16">Min Ft</th>
                <th className="py-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-16">Max Ft</th>
                <th className="py-1.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-14">UOM</th>
                <th className="py-1.5 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-24">Rate / UOM</th>
                <th className="py-1.5 pl-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                <th className="py-1.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {row.labourBands.map((band, idx) => {
                const active = band.isActive !== false;
                const isToggling = toggling === band.labourCode;
                const isEditing = editingCode === band.labourCode;
                const isConfirmingDelete = confirmDeleteCode === band.labourCode;
                const isDeletingThis = deletingCode === band.labourCode;

                if (isEditing) {
                  return (
                    <tr key={idx} className="bg-blue-50/60">
                      <td className="py-1.5 pl-2 w-7">
                        <input
                          type="checkbox"
                          checked={active}
                          disabled
                          className="h-3.5 w-3.5 rounded accent-emerald-600 opacity-50"
                        />
                      </td>
                      <td className="py-1.5 pl-2">
                        <input
                          autoFocus
                          className={cn(inputCls, 'font-mono')}
                          value={editForm.labourCode}
                          onChange={(e) => setEditField('labourCode', e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 pr-1">
                        <select className={inputCls} value={editForm.htBand} onChange={(e) => setEditField('htBand', e.target.value)}>
                          {HT_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-1">
                        <input type="number" className={cn(inputCls, 'text-center')} value={editForm.htMinFt} onChange={(e) => setEditField('htMinFt', e.target.value)} placeholder="0" />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input type="number" className={cn(inputCls, 'text-center')} value={editForm.htMaxFt} onChange={(e) => setEditField('htMaxFt', e.target.value)} placeholder="99" />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input className={inputCls} value={editForm.uom} onChange={(e) => setEditField('uom', e.target.value)} placeholder="SF" />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input type="number" step="0.0001" className={cn(inputCls, 'text-right')} value={editForm.ratePerUom} onChange={(e) => setEditField('ratePerUom', e.target.value)} placeholder="0.00" />
                      </td>
                      <td className="py-1.5 pr-1">
                        <input className={inputCls} value={editForm.description} onChange={(e) => setEditField('description', e.target.value)} placeholder="Description…" />
                      </td>
                      <td className="py-1.5 pr-1">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button type="button" onClick={handleEditSave} disabled={editSaving} title="Save changes" className="flex items-center justify-center w-6 h-6 rounded hover:bg-emerald-100 text-emerald-600 disabled:opacity-50">
                            <Check size={13} />
                          </button>
                          <button type="button" onClick={cancelEdit} disabled={editSaving} title="Cancel" className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-50">
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={idx}
                    className={cn(
                      'transition-colors',
                      active ? 'hover:bg-slate-100/60' : 'bg-slate-50/50 opacity-60',
                    )}
                  >
                    <td className="py-1.5 pl-2 w-7">
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={isToggling}
                        onChange={() => handleToggle(band.labourCode, active)}
                        title={active ? 'Visible in material database — uncheck to hide' : 'Hidden from material database — check to show'}
                        className="h-3.5 w-3.5 rounded cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-1.5 pl-2">
                      <CodeChip value={band.labourCode} dimmed={!active} />
                    </td>
                    <td className="py-1.5">
                      <Badge
                        variant={active ? (HT_BAND_VARIANT[band.htBand] ?? 'outline') : 'outline'}
                        className="text-[10px] py-0 whitespace-nowrap"
                      >
                        {band.htBand}
                      </Badge>
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-slate-600">{band.htMinFt}</td>
                    <td className="py-1.5 text-center tabular-nums text-slate-600">
                      {band.htMaxFt < 99 ? band.htMaxFt : <span className="text-slate-400">∞</span>}
                    </td>
                    <td className="py-1.5 text-slate-500">{band.uom || '—'}</td>
                    <td className="py-1.5 text-right"><RateCell value={band.ratePerUom} /></td>
                    <td className="py-1.5 pl-2 text-slate-500 max-w-xs truncate" title={band.description}>
                      {band.description || '—'}
                      {band.notes && (
                        <span className="ml-1.5 text-[10px] italic text-amber-600">({band.notes})</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-1">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteConfirm(band.labourCode)}
                            disabled={isDeletingThis}
                            title="Confirm delete"
                            className="flex items-center justify-center w-6 h-6 rounded bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCode(null)}
                            disabled={isDeletingThis}
                            title="Cancel"
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-50"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(band)}
                            title="Edit band"
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => canDelete ? setConfirmDeleteCode(band.labourCode) : undefined}
                            disabled={!canDelete}
                            title={canDelete ? 'Delete band' : 'Cannot delete the only band — delete the parent instead'}
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Inline add-band form */}
              {isAdding && (
                <tr className="bg-emerald-50/60">
                  <td className="py-1.5 pl-2 w-7" />
                  <td className="py-1.5 pl-2">
                    <input
                      autoFocus
                      className={cn(inputCls, 'font-mono')}
                      value={newBand.labourCode}
                      onChange={(e) => setBandField('labourCode', e.target.value)}
                      placeholder={`${row.parentCode}-STD`}
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <select
                      className={inputCls}
                      value={newBand.htBand}
                      onChange={(e) => setBandField('htBand', e.target.value)}
                    >
                      {HT_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-1">
                    <input
                      type="number"
                      className={cn(inputCls, 'text-center')}
                      value={newBand.htMinFt}
                      onChange={(e) => setBandField('htMinFt', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <input
                      type="number"
                      className={cn(inputCls, 'text-center')}
                      value={newBand.htMaxFt}
                      onChange={(e) => setBandField('htMaxFt', e.target.value)}
                      placeholder="99"
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <input
                      className={inputCls}
                      value={newBand.uom}
                      onChange={(e) => setBandField('uom', e.target.value)}
                      placeholder="SF"
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <input
                      type="number"
                      step="0.0001"
                      className={cn(inputCls, 'text-right')}
                      value={newBand.ratePerUom}
                      onChange={(e) => setBandField('ratePerUom', e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <input
                      className={inputCls}
                      value={newBand.description}
                      onChange={(e) => setBandField('description', e.target.value)}
                      placeholder="Description…"
                    />
                  </td>
                  <td className="py-1.5 pr-1">
                    <div className="flex items-center gap-0.5 justify-end">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        title="Save"
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-emerald-100 text-emerald-600 disabled:opacity-50"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAdding(false); setError(null); }}
                        disabled={saving}
                        title="Cancel"
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-50"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* QTY1 formula hint */}
          {row.labourBands[0]?.qty1Formula && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium">QTY1:</span>
              <code className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {row.labourBands[0].qty1Formula}
              </code>
              {row.labourBands[0].qty1Uom && (
                <span className="text-[10px] text-slate-400">{row.labourBands[0].qty1Uom}</span>
              )}
            </div>
          )}

          {error && <p className="text-[11px] text-red-600 mt-1.5 ml-0.5">{error}</p>}

          {!isAdding && !editingCode && (
            <button
              type="button"
              onClick={() => { setNewBand(emptyBandForm(row.parentCode)); setError(null); setIsAdding(true); }}
              className="mt-2 flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <Plus size={11} />
              Add Child Band
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LabourDatabaseTabProps {
  isActive?: boolean;
}

export function LabourDatabaseTab({ isActive = true }: LabourDatabaseTabProps) {
  const [rows, setRows] = useState<LabourDatabaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [parentSection, setParentSection] = useState('all');
  const [htBand, setHtBand] = useState('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<LabourDatabaseRow | null>(null);
  const [editing, setEditing] = useState<LabourDatabaseRow | null>(null);
  const [deleting, setDeleting] = useState<LabourDatabaseRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Defer first fetch until tab is first opened
  const [ready, setReady] = useState(isActive);
  useEffect(() => {
    if (isActive && !ready) setReady(true);
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback((q: string, sec: string, band: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({
      search: q,
      parentSection: sec === 'all' ? '' : sec,
      htBand: band === 'all' ? '' : band,
    });
    fetch(`/api/labour-database?${params}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setRows(j.data); })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, parentSection, htBand), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, parentSection, htBand, ready, load]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─── PATCH helper ──────────────────────────────────────────────────────────

  async function patchRow(row: LabourDatabaseRow, newBands: LabourBandEntry[]): Promise<LabourDatabaseRow> {
    const res = await fetch(`/api/labour-database/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentSection: row.parentSection,
        category: row.category,
        description: row.description,
        labourBands: newBands,
        qty1Formula: row.qty1Formula,
        qty1Uom: row.qty1Uom,
        notes: row.notes,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Update failed');
    const updated = json.data as LabourDatabaseRow;
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    return updated;
  }

  // ─── Toggle isActive on a band (checkbox) ──────────────────────────────────

  const handleToggleBand = useCallback(
    async (row: LabourDatabaseRow, bandLabourCode: string, newIsActive: boolean) => {
      const newBands = row.labourBands.map((b) =>
        b.labourCode === bandLabourCode ? { ...b, isActive: newIsActive } : b,
      );
      await patchRow(row, newBands);
    },
    // patchRow is stable (no deps), but using inline form to avoid eslint warning
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Add a new child band to an existing parent ────────────────────────────

  const handleAddBand = useCallback(
    async (row: LabourDatabaseRow, form: NewBandForm) => {
      const band: LabourBandEntry = {
        labourCode: form.labourCode.trim(),
        code: '',
        htBand: form.htBand,
        htMinFt: Number(form.htMinFt) || 0,
        htMaxFt: Number(form.htMaxFt) || 99,
        uom: form.uom.trim(),
        ratePerUom: Number(form.ratePerUom) || 0,
        description: form.description.trim(),
        notes: form.notes.trim(),
        qty1Formula: '',
        qty1Uom: '',
        isActive: true,
      };
      const sorted = [...row.labourBands, band].sort((a, b) => a.htMinFt - b.htMinFt);
      await patchRow(row, sorted);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Edit an existing child band ───────────────────────────────────────────

  const handleEditBand = useCallback(
    async (row: LabourDatabaseRow, originalCode: string, form: NewBandForm) => {
      const newBands = row.labourBands.map((b) =>
        b.labourCode === originalCode
          ? {
              ...b,
              labourCode: form.labourCode.trim(),
              htBand: form.htBand,
              htMinFt: Number(form.htMinFt) || 0,
              htMaxFt: Number(form.htMaxFt) || 99,
              uom: form.uom.trim(),
              ratePerUom: Number(form.ratePerUom) || 0,
              description: form.description.trim(),
              notes: form.notes.trim(),
            }
          : b,
      );
      const sorted = [...newBands].sort((a, b) => a.htMinFt - b.htMinFt);
      await patchRow(row, sorted);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Delete a single child band ────────────────────────────────────────────

  const handleDeleteBand = useCallback(
    async (row: LabourDatabaseRow, bandLabourCode: string) => {
      const newBands = row.labourBands.filter((b) => b.labourCode !== bandLabourCode);
      await patchRow(row, newBands);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Delete parent bunch ───────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/labour-database/${deleting.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        if (selected?.id === deleting.id) setSelected(null);
        setDeleting(null);
        load(search, parentSection, htBand);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search parent code, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={parentSection} onValueChange={setParentSection}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              <SelectItem value="Walls">Walls</SelectItem>
              <SelectItem value="Ceiling">Ceiling</SelectItem>
              <SelectItem value="Bulkhead">Bulkhead</SelectItem>
            </SelectContent>
          </Select>
          <Select value={htBand} onValueChange={setHtBand}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="HT Band" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Heights</SelectItem>
              {HT_BANDS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isLoading ? 'Loading…' : `${rows.length} bunch${rows.length !== 1 ? 'es' : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full border-collapse text-sm min-w-[700px]">
          <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
            <tr>
              <th className="w-8" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Parent Code</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Description</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Section</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Bands</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">UOM</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody>
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
              ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                      No labour bunches found
                    </td>
                  </tr>
                )
              : rows.map((row) => {
                  const isExpanded = expandedIds.has(row.id);
                  const firstBand = row.labourBands[0];
                  const allSameUom = row.labourBands.every(b => b.uom === firstBand?.uom);
                  const activeBandCount = row.labourBands.filter(b => b.isActive !== false).length;
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-slate-100 transition-colors cursor-pointer',
                          isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50',
                          selected?.id === row.id && 'bg-blue-50 hover:bg-blue-50',
                        )}
                        onClick={() => setSelected(row)}
                      >
                        <td
                          className="w-8 pl-3 text-center"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(row.id); }}
                        >
                          <ChevronRight className={cn('h-3.5 w-3.5 text-slate-600 transition-transform', isExpanded && 'rotate-90')} />
                        </td>
                        <td className="px-3 py-2.5"><CodeChip value={row.parentCode} /></td>
                        <td className="px-3 py-2.5 max-w-xs">
                          <span className="text-xs text-slate-700 truncate block" title={row.description}>
                            {row.description || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={SECTION_VARIANT[row.parentSection] ?? 'outline'} className="text-[10px] py-0 whitespace-nowrap">
                            {row.parentSection || '—'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs text-slate-500 tabular-nums">
                            {activeBandCount < row.labourBands.length
                              ? <>{activeBandCount}<span className="text-slate-300">/{row.labourBands.length}</span></>
                              : row.labourBands.length
                            }
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-slate-500">
                            {allSameUom ? (firstBand?.uom || '—') : 'Mixed'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(row)} title="Edit parent">
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDeleting(row)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <ChildBandsTable
                          key={`${row.id}-children`}
                          row={row}
                          onToggleBand={(code, newActive) => handleToggleBand(row, code, newActive)}
                          onAddBand={(form) => handleAddBand(row, form)}
                          onEditBand={(originalCode, form) => handleEditBand(row, originalCode, form)}
                          onDeleteBand={(code) => handleDeleteBand(row, code)}
                        />
                      )}
                    </>
                  );
                })}
          </tbody>
        </table>
      </div>

      <LabourDetailSheet labour={selected} onClose={() => setSelected(null)} />

      <ItemFormSheet
        activeTab="labour"
        isOpen={!!editing}
        editItem={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(search, parentSection, htBand); }}
      />

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete labour bunch?"
        message={`"${deleting?.parentCode}" will be moved to trash and permanently deleted after 30 days.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}

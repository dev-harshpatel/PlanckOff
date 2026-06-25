'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Hammer, Layers, ChevronDown, Check, Plus, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/shadcn/sheet';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import { Separator } from '@/components/shadcn/separator';
import type { MaterialDatabaseRow, LabourDatabaseRow, AssemblyBunchItem } from '@/types';

type TabId = 'materials' | 'labour' | 'assembly-bunches';

type BunchEditItem = AssemblyBunchItem & { branchCode: string; group: string };

interface ItemFormSheetProps {
  activeTab: TabId;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem?: MaterialDatabaseRow | LabourDatabaseRow | BunchEditItem | null;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-medium text-slate-700 block mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{children}</h4>
      {action}
    </div>
  );
}

// ─── Category Combobox ────────────────────────────────────────────────────────

function CategoryCombobox({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = !value.trim()
    ? categories
    : categories.filter((c) => c.toLowerCase().includes(value.toLowerCase()));

  const isNew =
    value.trim() !== '' &&
    !categories.some((c) => c.toLowerCase() === value.trim().toLowerCase());

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          autoComplete="off"
          className="w-full h-8 rounded-md border border-slate-200 bg-white px-3 pr-7 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="e.g. FRAMING"
        />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>

      {open && (filtered.length > 0 || isNew) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
          {filtered.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 ${
                value === cat ? 'font-medium text-emerald-700' : 'text-slate-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(cat);
                setOpen(false);
              }}
            >
              {value === cat
                ? <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                : <span className="h-3 w-3 shrink-0" />
              }
              {cat}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            >
              <span className="font-bold text-emerald-600">+</span>
              Create &ldquo;{value.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Labour Code Lookup/Picker ─────────────────────────────────────────────────
// Used by the Material form's Wall/Ceiling/Bulkhead labour code fields.
// Searches the Labour Database live — never duplicates or stores band data on
// the material row. If no match exists for the typed code, lets the user
// create a brand-new row directly in the Labour Database, then auto-fills it.

const NEW_LABOUR_DEFAULTS = {
  parentSection: 'Walls',
  description: '',
  htBand: 'All',
  htMinFt: '0',
  htMaxFt: '99',
  uom: '',
  ratePerUom: '',
  qty1Formula: '',
  qty1Uom: '',
};

function LabourCodeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Rows matching the search term (for the dropdown suggestions)
  const [suggestions, setSuggestions] = useState<LabourDatabaseRow[]>([]);
  // The row whose parentCode exactly matches the typed value (for the band preview)
  const [matchedRow, setMatchedRow] = useState<LabourDatabaseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(NEW_LABOUR_DEFAULTS);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search as the user types
  useEffect(() => {
    if (!value.trim()) { setSuggestions([]); setMatchedRow(null); return; }
    const timer = setTimeout(() => {
      fetch(`/api/labour-database?search=${encodeURIComponent(value.trim())}`)
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) return;
          const rows = j.data as LabourDatabaseRow[];
          setSuggestions(rows);
          const exact = rows.find(
            (r) => r.parentCode.toLowerCase() === value.trim().toLowerCase(),
          ) ?? null;
          setMatchedRow(exact);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const setNewField = useCallback((field: keyof typeof NEW_LABOUR_DEFAULTS, val: string) => {
    setNewForm((prev) => ({ ...prev, [field]: val }));
  }, []);

  async function handleCreateNew() {
    setCreateError(null);
    if (!value.trim()) { setCreateError('Parent code is required'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/labour-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentCode: value.trim(),
          parentSection: newForm.parentSection,
          description: newForm.description,
          qty1Formula: newForm.qty1Formula,
          qty1Uom: newForm.qty1Uom,
          notes: '',
          labourBands: [{
            labourCode: value.trim(),
            code: '',
            htBand: newForm.htBand,
            htMinFt: newForm.htMinFt !== '' ? Number(newForm.htMinFt) : 0,
            htMaxFt: newForm.htMaxFt !== '' ? Number(newForm.htMaxFt) : 99,
            description: newForm.description,
            uom: newForm.uom,
            ratePerUom: newForm.ratePerUom !== '' ? Number(newForm.ratePerUom) : 0,
            qty1Formula: newForm.qty1Formula,
            qty1Uom: newForm.qty1Uom,
            notes: '',
          }],
        }),
      });
      const json = await res.json();
      if (!json.success) { setCreateError(json.error ?? 'Failed to create labour entry'); return; }

      setMatchedRow(json.data as LabourDatabaseRow);
      setCreating(false);
      setNewForm(NEW_LABOUR_DEFAULTS);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <FieldLabel>{label}</FieldLabel>
      <input
        autoComplete="off"
        className="w-full h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setCreating(false); }}
        onFocus={() => setOpen(true)}
        placeholder="Search parent labour code…"
      />

      {open && value.trim() && !creating && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.length === 0 ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              onMouseDown={(e) => { e.preventDefault(); setCreating(true); setOpen(false); }}
            >
              <Plus size={12} />
              Create &ldquo;{value.trim()}&rdquo; in Labour Database
            </button>
          ) : (
            suggestions.map((row) => (
              <button
                key={row.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-slate-50"
                onMouseDown={(e) => { e.preventDefault(); onChange(row.parentCode); setOpen(false); }}
              >
                <span className="text-xs font-mono font-medium text-emerald-700">{row.parentCode}</span>
                <span className="text-[10px] text-slate-500 truncate w-full">{row.description}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Labour Band preview — shows all children of the matched parent row */}
      {matchedRow && !creating && (
        <div className="mt-1.5 overflow-x-auto rounded-md border border-slate-200">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border-b border-slate-200">
            <span className="text-[10px] text-slate-500">Labour Band</span>
            <code className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
              {matchedRow.parentCode}
            </code>
          </div>
          <table className="w-full text-[10px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold text-slate-400 uppercase tracking-wider">HT Band</th>
                <th className="px-2 py-1 text-right font-semibold text-slate-400 uppercase tracking-wider">Ft</th>
                <th className="px-2 py-1 text-left font-semibold text-slate-400 uppercase tracking-wider">UOM</th>
                <th className="px-2 py-1 text-right font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {matchedRow.labourBands.map((band, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-medium text-slate-700">{band.htBand}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                    {band.htMinFt}–{band.htMaxFt < 99 ? band.htMaxFt : '∞'}
                  </td>
                  <td className="px-2 py-1 text-slate-700">{band.uom || '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                    {band.ratePerUom ? `$${band.ratePerUom.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-2">
          <p className="text-[10px] font-semibold text-emerald-700">
            New Labour Database entry — &ldquo;{value.trim()}&rdquo;
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs"
              value={newForm.parentSection}
              onChange={(e) => setNewField('parentSection', e.target.value)}
            >
              <option value="Walls">Walls</option>
              <option value="Ceiling">Ceiling</option>
              <option value="Bulkhead">Bulkhead</option>
            </select>
            <input
              className="col-span-2 h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              placeholder="Description"
              value={newForm.description}
              onChange={(e) => setNewField('description', e.target.value)}
            />
            <select
              className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs"
              value={newForm.htBand}
              onChange={(e) => setNewField('htBand', e.target.value)}
            >
              {['All', 'Standard', 'Medium', 'High', 'Very High', 'Extra High'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <input
                type="number"
                className="h-7 w-1/2 rounded border border-slate-200 bg-white px-1.5 text-xs"
                placeholder="Min ft"
                value={newForm.htMinFt}
                onChange={(e) => setNewField('htMinFt', e.target.value)}
              />
              <input
                type="number"
                className="h-7 w-1/2 rounded border border-slate-200 bg-white px-1.5 text-xs"
                placeholder="Max ft"
                value={newForm.htMaxFt}
                onChange={(e) => setNewField('htMaxFt', e.target.value)}
              />
            </div>
            <input
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              placeholder="UOM"
              value={newForm.uom}
              onChange={(e) => setNewField('uom', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              placeholder="Rate per UOM"
              value={newForm.ratePerUom}
              onChange={(e) => setNewField('ratePerUom', e.target.value)}
            />
          </div>
          {createError && <p className="text-[10px] text-red-600">{createError}</p>}
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="text-[10px] text-slate-500 hover:text-slate-700 px-2 py-1"
              onClick={() => { setCreating(false); setCreateError(null); }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCreateNew}
              className="text-[10px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2.5 py-1 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create & Link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Material Form ────────────────────────────────────────────────────────────

interface SizeFormRow {
  size: string;
  sizeNum: string;
  containerUnit: string;
  sizeMm: string;
  sizeImperial: string;
}

const EMPTY_SIZE_ROW: SizeFormRow = {
  size: '', sizeNum: '', containerUnit: '', sizeMm: '', sizeImperial: '',
};

interface MatForm {
  category: string;
  assemblyCode: string;
  code: string;
  wallLabourCode: string;
  ceilingLabourCode: string;
  bulkheadLabourCode: string;
  type: string;
  description: string;
  section: string;
  unitPrice: string;
  sizes: SizeFormRow[];
  qty1Formula: string;
  uom1: string;
  qty2Formula: string;
  uom2: string;
  qty1FormulaCeiling: string;
  uom1Ceiling: string;
  qty2FormulaCeiling: string;
  uom2Ceiling: string;
  notes: string;
}

const DEFAULT_MAT: MatForm = {
  category: '', assemblyCode: '', code: '',
  wallLabourCode: '', ceilingLabourCode: '', bulkheadLabourCode: '',
  type: '', description: '', section: '',
  unitPrice: '',
  sizes: [],
  qty1Formula: '', uom1: '', qty2Formula: '', uom2: '',
  qty1FormulaCeiling: '', uom1Ceiling: '', qty2FormulaCeiling: '', uom2Ceiling: '',
  notes: '',
};

function materialToForm(m: MaterialDatabaseRow): MatForm {
  return {
    category: m.category,
    assemblyCode: m.assemblyCode,
    code: m.code,
    wallLabourCode: m.wallLabourCode,
    ceilingLabourCode: m.ceilingLabourCode,
    bulkheadLabourCode: m.bulkheadLabourCode,
    type: m.type,
    description: m.description,
    section: m.section,
    unitPrice: m.unitPrice ? String(m.unitPrice) : '',
    sizes: m.sizes.map((s) => ({
      size: s.size,
      sizeNum: s.sizeNum ? String(s.sizeNum) : '',
      containerUnit: s.containerUnit,
      sizeMm: s.sizeMm != null ? String(s.sizeMm) : '',
      sizeImperial: s.sizeImperial ?? '',
    })),
    qty1Formula: m.qty1Formula,
    uom1: m.uom1,
    qty2Formula: m.qty2Formula,
    uom2: m.uom2,
    qty1FormulaCeiling: m.qty1FormulaCeiling,
    uom1Ceiling: m.uom1Ceiling,
    qty2FormulaCeiling: m.qty2FormulaCeiling,
    uom2Ceiling: m.uom2Ceiling,
    notes: m.notes,
  };
}

function AddMaterialForm({
  editItem,
  onSaved,
  onClose,
}: {
  editItem?: MaterialDatabaseRow | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = !!editItem;
  const [form, setForm] = useState<MatForm>(editItem ? materialToForm(editItem) : DEFAULT_MAT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [nextRowNum, setNextRowNum] = useState<number | null>(null);
  const [rowNumLoading, setRowNumLoading] = useState(false);

  useEffect(() => {
    fetch('/api/material-database?meta=categories')
      .then((r) => r.json())
      .then((j) => { if (j.success && Array.isArray(j.data)) setCategories(j.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) return;
    const cat = form.category.trim();
    if (!cat) { setNextRowNum(null); return; }

    setRowNumLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/material-database?meta=nextRowNum&category=${encodeURIComponent(cat)}`)
        .then((r) => r.json())
        .then((j) => { if (j.success) setNextRowNum(j.data.rowNum); })
        .catch(() => {})
        .finally(() => setRowNumLoading(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [form.category, isEdit]);

  const set = useCallback((field: keyof Omit<MatForm, 'sizes'>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addSizeRow = useCallback(() => {
    setForm((prev) => ({ ...prev, sizes: [...prev.sizes, { ...EMPTY_SIZE_ROW }] }));
  }, []);

  const removeSizeRow = useCallback((idx: number) => {
    setForm((prev) => ({ ...prev, sizes: prev.sizes.filter((_, i) => i !== idx) }));
  }, []);

  const updateSizeRow = useCallback((idx: number, field: keyof SizeFormRow, value: string) => {
    setForm((prev) => {
      const next = [...prev.sizes];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, sizes: next };
    });
  }, []);

  async function handleSave() {
    setError(null);
    if (!form.category.trim()) { setError('Category is required'); return; }
    if (!form.code.trim()) { setError('Code is required'); return; }

    const sizes = form.sizes.map((s) => ({
      size: s.size,
      sizeNum: s.sizeNum !== '' ? Number(s.sizeNum) : 0,
      containerUnit: s.containerUnit,
      sizeMm: s.sizeMm !== '' ? Number(s.sizeMm) : null,
      sizeImperial: s.sizeImperial || null,
    }));

    setSaving(true);
    try {
      const url = isEdit ? `/api/material-database/${editItem!.id}` : '/api/material-database';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sizes,
          unitPrice: form.unitPrice !== '' ? Number(form.unitPrice) : 0,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Failed to save'); return; }
      if (!isEdit) setForm(DEFAULT_MAT);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-5 py-4 space-y-5">

          {/* 1 ── Identity */}
          <div>
            <SectionHeading>Identity</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldLabel required>Category</FieldLabel>
                <CategoryCombobox
                  value={form.category}
                  onChange={(v) => set('category', v)}
                  categories={categories}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Select an existing category or type a new name and click&nbsp;
                  <span className="font-medium text-emerald-600">+ Create</span> to add it.
                </p>
              </div>
              {!isEdit && (
                <div className="col-span-2">
                  <FieldLabel>Row Number</FieldLabel>
                  <div className="relative">
                    <input
                      readOnly
                      value={rowNumLoading ? '' : nextRowNum !== null ? nextRowNum : ''}
                      placeholder={
                        !form.category.trim()
                          ? 'Select a category first'
                          : rowNumLoading
                          ? 'Calculating…'
                          : '—'
                      }
                      className="w-full h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 placeholder:text-slate-400 cursor-not-allowed select-none"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                      Auto
                    </span>
                  </div>
                </div>
              )}
              <div>
                <FieldLabel>Assembly Code</FieldLabel>
                <Input className="h-8 text-xs" value={form.assemblyCode} onChange={(e) => set('assemblyCode', e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Code</FieldLabel>
                <Input className="h-8 text-xs" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. C25A112112H" />
              </div>
            </div>
          </div>

          {/* 2 ── Labour Band — picked live from the Labour Database, never duplicated here */}
          <div>
            <SectionHeading>Labour Band</SectionHeading>
            <div className="grid grid-cols-1 gap-3">
              <LabourCodeField
                label="Wall Labour Code"
                value={form.wallLabourCode}
                onChange={(v) => set('wallLabourCode', v)}
              />
              <LabourCodeField
                label="Ceiling Labour Code"
                value={form.ceilingLabourCode}
                onChange={(v) => set('ceilingLabourCode', v)}
              />
              <LabourCodeField
                label="Bulkhead Labour Code"
                value={form.bulkheadLabourCode}
                onChange={(v) => set('bulkheadLabourCode', v)}
              />
            </div>
          </div>

          {/* 3 ── Details */}
          <div>
            <SectionHeading>Details</SectionHeading>
            <div className="space-y-3">
              <div>
                <FieldLabel>Type</FieldLabel>
                <Input className="h-8 text-xs" value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="Angle" />
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <Input className="h-8 text-xs" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div>
                <FieldLabel>Section (CSI)</FieldLabel>
                <Input className="h-8 text-xs" value={form.section} onChange={(e) => set('section', e.target.value)} placeholder="09 22 16" />
              </div>
            </div>
          </div>

          {/* 4 ── Sizes (inline array editor) */}
          <div>
            <SectionHeading
              action={
                <button
                  type="button"
                  onClick={addSizeRow}
                  className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
                >
                  <Plus size={11} />
                  Add Size
                </button>
              }
            >
              Sizes
            </SectionHeading>

            {form.sizes.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-1">
                No sizes added. Click &ldquo;Add Size&rdquo; to add entries.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left pb-1.5 pr-1.5 font-semibold text-slate-500 min-w-[70px]">Size</th>
                      <th className="text-left pb-1.5 pr-1.5 font-semibold text-slate-500 min-w-[60px]">Size Num</th>
                      <th className="text-left pb-1.5 pr-1.5 font-semibold text-slate-500 min-w-[80px]">Container Unit</th>
                      <th className="text-left pb-1.5 pr-1.5 font-semibold text-slate-500 min-w-[60px]">Size MM</th>
                      <th className="text-left pb-1.5 pr-1.5 font-semibold text-slate-500 min-w-[60px]">Imperial</th>
                      <th className="pb-1.5 w-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {form.sizes.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-1 pr-1.5">
                          <input
                            className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={row.size}
                            onChange={(e) => updateSizeRow(idx, 'size', e.target.value)}
                            placeholder="10'"
                          />
                        </td>
                        <td className="py-1 pr-1.5">
                          <input
                            type="number"
                            className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={row.sizeNum}
                            onChange={(e) => updateSizeRow(idx, 'sizeNum', e.target.value)}
                            placeholder="10"
                          />
                        </td>
                        <td className="py-1 pr-1.5">
                          <input
                            className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={row.containerUnit}
                            onChange={(e) => updateSizeRow(idx, 'containerUnit', e.target.value)}
                            placeholder="Piece"
                          />
                        </td>
                        <td className="py-1 pr-1.5">
                          <input
                            type="number"
                            className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={row.sizeMm}
                            onChange={(e) => updateSizeRow(idx, 'sizeMm', e.target.value)}
                            placeholder="—"
                          />
                        </td>
                        <td className="py-1 pr-1.5">
                          <input
                            className="w-full h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={row.sizeImperial}
                            onChange={(e) => updateSizeRow(idx, 'sizeImperial', e.target.value)}
                            placeholder='1/2"'
                          />
                        </td>
                        <td className="py-1">
                          <button
                            type="button"
                            onClick={() => removeSizeRow(idx)}
                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Unit Price stays flat — it applies to the item, not per-size */}
            <div className="mt-3">
              <FieldLabel>Unit Price</FieldLabel>
              <Input
                className="h-8 text-xs"
                type="number"
                step="0.01"
                value={form.unitPrice}
                onChange={(e) => set('unitPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* 5 ── Wall Formulas */}
          <div>
            <SectionHeading>Wall Formulas</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldLabel>QTY1 Formula</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.qty1Formula} onChange={(e) => set('qty1Formula', e.target.value)} placeholder="[LEN] * [LAYER] * (1 + [WST_FR])" />
              </div>
              <div>
                <FieldLabel>UOM1</FieldLabel>
                <Input className="h-8 text-xs" value={form.uom1} onChange={(e) => set('uom1', e.target.value)} placeholder="LF" />
              </div>
              <div className="col-span-2">
                <FieldLabel>QTY2 Formula</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.qty2Formula} onChange={(e) => set('qty2Formula', e.target.value)} placeholder="QTY1 / [SIZE_NUM]" />
              </div>
              <div>
                <FieldLabel>UOM2</FieldLabel>
                <Input className="h-8 text-xs" value={form.uom2} onChange={(e) => set('uom2', e.target.value)} placeholder="Pieces" />
              </div>
            </div>
          </div>

          {/* 6 ── Ceiling Formulas */}
          <div>
            <SectionHeading>Ceiling Formulas</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldLabel>QTY1 Formula</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.qty1FormulaCeiling} onChange={(e) => set('qty1FormulaCeiling', e.target.value)} />
              </div>
              <div>
                <FieldLabel>UOM1</FieldLabel>
                <Input className="h-8 text-xs" value={form.uom1Ceiling} onChange={(e) => set('uom1Ceiling', e.target.value)} />
              </div>
              <div className="col-span-2">
                <FieldLabel>QTY2 Formula</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.qty2FormulaCeiling} onChange={(e) => set('qty2FormulaCeiling', e.target.value)} />
              </div>
              <div>
                <FieldLabel>UOM2</FieldLabel>
                <Input className="h-8 text-xs" value={form.uom2Ceiling} onChange={(e) => set('uom2Ceiling', e.target.value)} />
              </div>
            </div>
          </div>

          {/* 7 ── Notes */}
          <div>
            <SectionHeading>Notes</SectionHeading>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>

        </div>
      </ScrollArea>

      {error && (
        <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200 shrink-0">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Material'}
        </Button>
      </div>
    </div>
  );
}

// ─── Labour Form ──────────────────────────────────────────────────────────────
// Every labour row is unique and atomic (one Excel row = one row here) — no
// array editor. Storage is still a single-entry labourBands[] array under the
// hood, but the form edits it as flat fields, matching the original sheet.

interface LabourForm {
  parentSection: string;
  labourCode: string;
  code: string;
  description: string;
  category: string;
  htBand: string;
  htMinFt: string;
  htMaxFt: string;
  uom: string;
  ratePerUom: string;
  qty1Formula: string;
  qty1Uom: string;
  notes: string;
}

const DEFAULT_LABOUR: LabourForm = {
  parentSection: '', labourCode: '', code: '', description: '', category: '',
  htBand: '', htMinFt: '', htMaxFt: '', uom: '', ratePerUom: '',
  qty1Formula: '', qty1Uom: '', notes: '',
};

const HT_BANDS = ['All', 'Standard', 'Medium', 'High', 'Very High', 'Extra High'];

function labourToForm(l: LabourDatabaseRow): LabourForm {
  const band = l.labourBands[0];
  return {
    parentSection: l.parentSection,
    labourCode: band?.labourCode ?? '',
    code: band?.code ?? '',
    description: l.description,
    category: l.category,
    htBand: band?.htBand ?? '',
    htMinFt: band?.htMinFt != null ? String(band.htMinFt) : '',
    htMaxFt: band?.htMaxFt != null ? String(band.htMaxFt) : '',
    uom: band?.uom ?? '',
    ratePerUom: band?.ratePerUom ? String(band.ratePerUom) : '',
    qty1Formula: l.qty1Formula,
    qty1Uom: l.qty1Uom,
    notes: l.notes,
  };
}

function AddLabourForm({
  editItem,
  onSaved,
  onClose,
}: {
  editItem?: LabourDatabaseRow | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = !!editItem;
  const [form, setForm] = useState<LabourForm>(editItem ? labourToForm(editItem) : DEFAULT_LABOUR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback((field: keyof LabourForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handleSave() {
    setError(null);
    if (!form.labourCode.trim()) { setError('Labour code is required'); return; }
    if (!form.parentSection) { setError('Parent section is required'); return; }
    if (!form.htBand) { setError('HT band is required'); return; }

    setSaving(true);
    try {
      const url = isEdit ? `/api/labour-database/${editItem!.id}` : '/api/labour-database';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSection: form.parentSection,
          description: form.description,
          category: form.category,
          qty1Formula: form.qty1Formula,
          qty1Uom: form.qty1Uom,
          notes: form.notes,
          labourBands: [{
            labourCode: form.labourCode,
            code: form.code,
            htBand: form.htBand,
            htMinFt: form.htMinFt !== '' ? Number(form.htMinFt) : 0,
            htMaxFt: form.htMaxFt !== '' ? Number(form.htMaxFt) : 99,
            uom: form.uom,
            ratePerUom: form.ratePerUom !== '' ? Number(form.ratePerUom) : 0,
          }],
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Failed to save'); return; }
      if (!isEdit) setForm(DEFAULT_LABOUR);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-5 py-4 space-y-5">

          <div>
            <SectionHeading>Identity</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Parent Section</FieldLabel>
                <Select value={form.parentSection} onValueChange={(v) => set('parentSection', v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Walls">Walls</SelectItem>
                    <SelectItem value="Ceiling">Ceiling</SelectItem>
                    <SelectItem value="Bulkhead">Bulkhead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel required>Labour Code</FieldLabel>
                <Input className="h-8 text-xs" value={form.labourCode} onChange={(e) => set('labourCode', e.target.value)} placeholder="LAB-FRM-STD" />
              </div>
              <div>
                <FieldLabel>Code (short)</FieldLabel>
                <Input className="h-8 text-xs" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="STD" />
              </div>
              <div>
                <FieldLabel>Category</FieldLabel>
                <Input className="h-8 text-xs" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Framing" />
              </div>
              <div className="col-span-2">
                <FieldLabel>Description</FieldLabel>
                <Input className="h-8 text-xs" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <SectionHeading>Height Band</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <FieldLabel required>HT Band</FieldLabel>
                <Select value={form.htBand} onValueChange={(v) => set('htBand', v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {HT_BANDS.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>HT Min (ft)</FieldLabel>
                <Input className="h-8 text-xs" type="number" value={form.htMinFt} onChange={(e) => set('htMinFt', e.target.value)} placeholder="0" />
              </div>
              <div>
                <FieldLabel>HT Max (ft)</FieldLabel>
                <Input className="h-8 text-xs" type="number" value={form.htMaxFt} onChange={(e) => set('htMaxFt', e.target.value)} placeholder="10" />
              </div>
            </div>
          </div>

          <div>
            <SectionHeading>Rate &amp; Formula</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>UOM</FieldLabel>
                <Input className="h-8 text-xs" value={form.uom} onChange={(e) => set('uom', e.target.value)} placeholder="SF" />
              </div>
              <div>
                <FieldLabel>Rate Per UOM</FieldLabel>
                <Input className="h-8 text-xs" type="number" step="0.01" value={form.ratePerUom} onChange={(e) => set('ratePerUom', e.target.value)} placeholder="0.00" />
              </div>
              <div className="col-span-2">
                <FieldLabel>QTY1 Formula</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.qty1Formula} onChange={(e) => set('qty1Formula', e.target.value)} placeholder="SF * 1.0" />
              </div>
              <div>
                <FieldLabel>QTY1 UOM</FieldLabel>
                <Input className="h-8 text-xs" value={form.qty1Uom} onChange={(e) => set('qty1Uom', e.target.value)} placeholder="SF" />
              </div>
            </div>
          </div>

          <div>
            <SectionHeading>Notes</SectionHeading>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>

        </div>
      </ScrollArea>

      {error && (
        <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200 shrink-0">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Labour'}
        </Button>
      </div>
    </div>
  );
}

// ─── Assembly Bunch Form ──────────────────────────────────────────────────────

interface BunchForm {
  branchCode: string;
  group: string;
  itemCode: string;
  assemblyCode: string;
  description: string;
  size: string;
  layers: string;
  labourCode: string;
  section: string;
  note: string;
  sortOrder: string;
}

const DEFAULT_BUNCH: BunchForm = {
  branchCode: '', group: '', itemCode: '', assemblyCode: '',
  description: '', size: '', layers: '', labourCode: '',
  section: '', note: '', sortOrder: '',
};

function bunchToForm(b: BunchEditItem): BunchForm {
  return {
    branchCode: b.branchCode, group: b.group, itemCode: b.itemCode, assemblyCode: b.assemblyCode,
    description: b.description, size: b.size, layers: b.layers != null ? String(b.layers) : '',
    labourCode: b.labourCode, section: b.section, note: b.note,
    sortOrder: b.sortOrder != null ? String(b.sortOrder) : '',
  };
}

function AddAssemblyBunchForm({
  editItem,
  onSaved,
  onClose,
}: {
  editItem?: BunchEditItem | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = !!editItem;
  const [form, setForm] = useState<BunchForm>(editItem ? bunchToForm(editItem) : DEFAULT_BUNCH);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback((field: keyof BunchForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handleSave() {
    setError(null);
    if (!form.branchCode.trim()) { setError('Branch code is required'); return; }
    if (!form.group.trim()) { setError('Group is required'); return; }

    setSaving(true);
    try {
      const url = isEdit ? `/api/assembly-bunch-database/${editItem!.id}` : '/api/assembly-bunch-database';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          layers: form.layers !== '' ? Number(form.layers) : null,
          sortOrder: form.sortOrder !== '' ? Number(form.sortOrder) : 0,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Failed to save'); return; }
      if (!isEdit) setForm(DEFAULT_BUNCH);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-5 py-4 space-y-5">

          <div>
            <SectionHeading>Branch</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Branch Code</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.branchCode} onChange={(e) => set('branchCode', e.target.value)} placeholder="FR-WALL" />
              </div>
              <div>
                <FieldLabel required>Group</FieldLabel>
                <Input className="h-8 text-xs" value={form.group} onChange={(e) => set('group', e.target.value)} placeholder="Framing" />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <SectionHeading>Item Details</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Item Code</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.itemCode} onChange={(e) => set('itemCode', e.target.value)} placeholder="XXXXXXX" />
              </div>
              <div>
                <FieldLabel>Assembly Code</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.assemblyCode} onChange={(e) => set('assemblyCode', e.target.value)} />
              </div>
              <div className="col-span-2">
                <FieldLabel>Description</FieldLabel>
                <Input className="h-8 text-xs" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div>
                <FieldLabel>Size</FieldLabel>
                <Input className="h-8 text-xs" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder='1/2"' />
              </div>
              <div>
                <FieldLabel>Layers</FieldLabel>
                <Input className="h-8 text-xs" type="number" value={form.layers} onChange={(e) => set('layers', e.target.value)} />
              </div>
              <div>
                <FieldLabel>Labour Code</FieldLabel>
                <Input className="h-8 text-xs font-mono" value={form.labourCode} onChange={(e) => set('labourCode', e.target.value)} />
              </div>
              <div>
                <FieldLabel>Section</FieldLabel>
                <Input className="h-8 text-xs" value={form.section} onChange={(e) => set('section', e.target.value)} placeholder="09 22 16" />
              </div>
              <div>
                <FieldLabel>Sort Order</FieldLabel>
                <Input className="h-8 text-xs" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
              </div>
              <div className="col-span-2">
                <FieldLabel>Note</FieldLabel>
                <textarea
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>

      {error && (
        <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200 shrink-0">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
        </Button>
      </div>
    </div>
  );
}

// ─── Tab meta ─────────────────────────────────────────────────────────────────

const TAB_META: Record<TabId, { addLabel: string; editLabel: string; description: string; icon: React.ReactNode }> = {
  materials: {
    addLabel: 'Add Material',
    editLabel: 'Edit Material',
    description: 'Add a new row to the material reference database',
    icon: <Database className="w-4 h-4 text-emerald-400" />,
  },
  labour: {
    addLabel: 'Add Labour',
    editLabel: 'Edit Labour',
    description: 'Add a new labour entry to the labour database',
    icon: <Hammer className="w-4 h-4 text-blue-400" />,
  },
  'assembly-bunches': {
    addLabel: 'Add Assembly Item',
    editLabel: 'Edit Assembly Item',
    description: 'Add a new item to an assembly bunch branch',
    icon: <Layers className="w-4 h-4 text-purple-400" />,
  },
};

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function ItemFormSheet({ activeTab, isOpen, onClose, onSaved, editItem }: ItemFormSheetProps) {
  const meta = TAB_META[activeTab];
  const isEdit = !!editItem;

  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    if (isOpen) setMountKey((k) => k + 1);
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg" className="w-full flex flex-col p-0 gap-0">
        <div className="bg-slate-900 px-5 py-4 flex items-start gap-3 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20 shrink-0 mt-0.5">
            {meta.icon}
          </div>
          <SheetHeader className="flex-1 min-w-0">
            <SheetTitle className="text-white text-sm leading-tight">
              {isEdit ? meta.editLabel : meta.addLabel}
            </SheetTitle>
            <SheetDescription className="text-slate-400 text-xs mt-0.5">{meta.description}</SheetDescription>
          </SheetHeader>
        </div>

        <div key={mountKey} className="flex-1 flex flex-col min-h-0">
          {activeTab === 'materials' && (
            <AddMaterialForm
              editItem={editItem as MaterialDatabaseRow | null}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}
          {activeTab === 'labour' && (
            <AddLabourForm
              editItem={editItem as LabourDatabaseRow | null}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}
          {activeTab === 'assembly-bunches' && (
            <AddAssemblyBunchForm
              editItem={editItem as BunchEditItem | null}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

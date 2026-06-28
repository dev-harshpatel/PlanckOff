'use client';

import { useState, useCallback, useEffect } from 'react';
import { Package, Code2, Layers, Ruler, FlaskConical, Link2, Hammer, Plus, X, Check } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/shadcn/sheet';
import { Badge } from '@/components/shadcn/badge';
import { Separator } from '@/components/shadcn/separator';
import { ScrollArea } from '@/components/shadcn/scroll-area';
import { Skeleton } from '@/components/shadcn/skeleton';
import type { MaterialDatabaseRow, SizeEntry, LabourDatabaseRow, LabourBandEntry } from '@/types';

interface MaterialDetailSheetProps {
  material: MaterialDatabaseRow | null;
  onClose: () => void;
  onUpdated: (material: MaterialDatabaseRow) => void;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value !== null && value !== undefined && value !== '' ? String(value) : '—';
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-xs text-right font-medium text-foreground break-all">{display}</span>
    </div>
  );
}

function FormulaBlock({ label, formula, uom }: { label: string; formula: string; uom: string }) {
  if (!formula) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 text-[11px] font-mono bg-slate-900 text-emerald-300 px-3 py-2 rounded-md leading-relaxed break-all">
          {formula}
        </code>
        {uom && (
          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-1.5 rounded shrink-0">
            {uom}
          </span>
        )}
      </div>
    </div>
  );
}

interface NewSizeForm {
  size: string;
  sizeNum: string;
  containerUnit: string;
  unitPrice: string;
}

const EMPTY_NEW_SIZE: NewSizeForm = {
  size: '', sizeNum: '', containerUnit: '', unitPrice: '',
};

const HT_BANDS = ['All', 'Standard', 'Medium', 'High', 'Very High', 'Extra High'];

interface NewBandForm {
  labourCode: string;
  htBand: string;
  htMinFt: string;
  htMaxFt: string;
  uom: string;
  ratePerUom: string;
}

const EMPTY_NEW_BAND: NewBandForm = {
  labourCode: '', htBand: 'All', htMinFt: '0', htMaxFt: '99', uom: '', ratePerUom: '',
};

type LabourFieldKey = 'wallLabourCode' | 'ceilingLabourCode' | 'bulkheadLabourCode';
type SlotKey = 'wall' | 'ceiling' | 'bulkhead';

interface LabourSlot {
  key: SlotKey;
  label: string;
  code: string;
  parentSection: 'Walls' | 'Ceiling' | 'Bulkhead';
  materialField: LabourFieldKey;
}

function buildSlots(material: MaterialDatabaseRow): LabourSlot[] {
  return [
    { key: 'wall', label: 'Wall Labour Band', code: material.wallLabourCode, parentSection: 'Walls', materialField: 'wallLabourCode' },
    { key: 'ceiling', label: 'Ceiling Labour Band', code: material.ceilingLabourCode, parentSection: 'Ceiling', materialField: 'ceilingLabourCode' },
    { key: 'bulkhead', label: 'Bulkhead Labour Band', code: material.bulkheadLabourCode, parentSection: 'Bulkhead', materialField: 'bulkheadLabourCode' },
  ];
}

export function MaterialDetailSheet({ material, onClose, onUpdated }: MaterialDetailSheetProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSize, setNewSize] = useState<NewSizeForm>(EMPTY_NEW_SIZE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Labour Band — resolved live from the Labour Database, bifurcated per
  // link (Wall / Ceiling / Bulkhead). Each link's code can match MULTIPLE
  // bands (e.g. different height ranges), so each slot renders an array,
  // same pattern as Sizes — but Wall/Ceiling/Bulkhead are never mixed together.
  const [matchesByCode, setMatchesByCode] = useState<Record<string, LabourBandEntry[]>>({});
  const [isLoadingBands, setIsLoadingBands] = useState(false);
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null);
  const [newBand, setNewBand] = useState<NewBandForm>(EMPTY_NEW_BAND);
  const [bandSaving, setBandSaving] = useState(false);
  const [bandError, setBandError] = useState<string | null>(null);

  const refreshLabourMatches = useCallback(async (m: MaterialDatabaseRow) => {
    const codes = [m.wallLabourCode, m.ceilingLabourCode, m.bulkheadLabourCode]
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) { setMatchesByCode({}); return; }

    setIsLoadingBands(true);
    try {
      const results = await Promise.all(
        codes.map((code) =>
          fetch(`/api/labour-database?search=${encodeURIComponent(code)}`)
            .then((r) => r.json())
            .then((j) => (j.success ? (j.data as LabourDatabaseRow[]) : []))
            .catch(() => [] as LabourDatabaseRow[]),
        ),
      );

      const map: Record<string, LabourBandEntry[]> = {};
      codes.forEach((code, i) => {
        const key = code.toLowerCase();
        // Match on parentCode (material DB stores parent codes like LAB-HNG)
        const parentRow = results[i].find((r) => r.parentCode.toLowerCase() === key);
        map[key] = parentRow
          ? [...parentRow.labourBands]
              .filter((b) => b.isActive !== false)   // only active bands
              .sort((a, b) => a.htMinFt - b.htMinFt)
          : [];
      });
      setMatchesByCode(map);
    } finally {
      setIsLoadingBands(false);
    }
  }, []);

  useEffect(() => {
    if (material) refreshLabourMatches(material);
    else setMatchesByCode({});
    setOpenSlot(null);
    setBandError(null);
  }, [material, refreshLabourMatches]);

  const startAdd = useCallback(() => {
    setNewSize(EMPTY_NEW_SIZE);
    setError(null);
    setIsAdding(true);
  }, []);

  const cancelAdd = useCallback(() => {
    setIsAdding(false);
    setError(null);
  }, []);

  const set = useCallback((field: keyof NewSizeForm, value: string) => {
    setNewSize((prev) => ({ ...prev, [field]: value }));
  }, []);

  const startAddBand = useCallback((slot: LabourSlot) => {
    setNewBand({ ...EMPTY_NEW_BAND, labourCode: slot.code.trim() });
    setBandError(null);
    setOpenSlot(slot.key);
  }, []);

  const cancelAddBand = useCallback(() => {
    setOpenSlot(null);
    setBandError(null);
  }, []);

  const setBandField = useCallback((field: keyof NewBandForm, value: string) => {
    setNewBand((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handleSaveSize() {
    if (!material) return;
    setError(null);
    setSaving(true);
    try {
      const size: SizeEntry = {
        size: newSize.size.trim(),
        sizeNum: newSize.sizeNum !== '' ? Number(newSize.sizeNum) : 0,
        containerUnit: newSize.containerUnit.trim(),
        sizeMm: null,
        sizeImperial: null,
        unitPrice: newSize.unitPrice !== '' ? Number(newSize.unitPrice) : 0,
      };

      const res = await fetch(`/api/material-database/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSection: material.parentSection,
          category: material.category,
          assemblyCode: material.assemblyCode,
          code: material.code,
          wallLabourCode: material.wallLabourCode,
          ceilingLabourCode: material.ceilingLabourCode,
          bulkheadLabourCode: material.bulkheadLabourCode,
          type: material.type,
          description: material.description,
          section: material.section,
          sizes: [...material.sizes, size],
          unitPrice: material.unitPrice,
          qty1Formula: material.qty1Formula,
          uom1: material.uom1,
          qty2Formula: material.qty2Formula,
          uom2: material.uom2,
          qty1FormulaCeiling: material.qty1FormulaCeiling,
          uom1Ceiling: material.uom1Ceiling,
          qty2FormulaCeiling: material.qty2FormulaCeiling,
          uom2Ceiling: material.uom2Ceiling,
          notes: material.notes,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Failed to save'); return; }
      onUpdated(json.data);
      setIsAdding(false);
    } finally {
      setSaving(false);
    }
  }

  // Adding a band: if the parent labour row already exists (it has a parentCode matching
  // slot.code), PATCH it to append the new band to its labourBands array.
  // If no parent exists yet, POST to create one (then also link the code to this material).
  async function handleSaveBand(slot: LabourSlot) {
    if (!material) return;
    setBandError(null);
    const codeToUse = slot.code.trim() || newBand.labourCode.trim();
    if (!codeToUse) { setBandError('Labour code is required'); return; }

    setBandSaving(true);
    try {
      const band = {
        labourCode: newBand.labourCode.trim() || codeToUse,
        code: '',
        htBand: newBand.htBand,
        htMinFt: newBand.htMinFt !== '' ? Number(newBand.htMinFt) : 0,
        htMaxFt: newBand.htMaxFt !== '' ? Number(newBand.htMaxFt) : 99,
        uom: newBand.uom.trim(),
        ratePerUom: newBand.ratePerUom !== '' ? Number(newBand.ratePerUom) : 0,
        description: '',
        notes: '',
        qty1Formula: '',
        qty1Uom: '',
        isActive: true,
      };

      // Try to find the existing parent row first
      const searchRes = await fetch(
        `/api/labour-database?search=${encodeURIComponent(codeToUse)}`,
      ).then((r) => r.json()).catch(() => ({ success: false }));

      const existingRow = searchRes.success
        ? (searchRes.data as LabourDatabaseRow[]).find(
            (r) => r.parentCode.toLowerCase() === codeToUse.toLowerCase(),
          )
        : undefined;

      let saveOk = false;
      if (existingRow) {
        // PATCH the existing parent row — add band to its labourBands array
        const sorted = [...existingRow.labourBands, band].sort((a, b) => a.htMinFt - b.htMinFt);
        const patchRes = await fetch(`/api/labour-database/${existingRow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentSection: existingRow.parentSection,
            category: existingRow.category,
            description: existingRow.description,
            labourBands: sorted,
            qty1Formula: existingRow.qty1Formula,
            qty1Uom: existingRow.qty1Uom,
            notes: existingRow.notes,
          }),
        });
        const patchJson = await patchRes.json();
        if (!patchJson.success) { setBandError(patchJson.error ?? 'Failed to save'); return; }
        saveOk = true;
      } else {
        // No parent row yet — create one via POST
        const postRes = await fetch('/api/labour-database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentCode: codeToUse,
            parentSection: slot.parentSection,
            category: material.category,
            description: material.description,
            qty1Formula: '',
            qty1Uom: '',
            notes: '',
            labourBands: [band],
          }),
        });
        const postJson = await postRes.json();
        if (!postJson.success) { setBandError(postJson.error ?? 'Failed to save'); return; }
        saveOk = true;
      }

      if (!saveOk) return;

      let current = material;
      // If the slot had no code yet, link the new code back to this material row
      if (!slot.code.trim()) {
        const patchRes = await fetch(`/api/material-database/${material.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentSection: material.parentSection,
            category: material.category,
            assemblyCode: material.assemblyCode,
            code: material.code,
            wallLabourCode: slot.materialField === 'wallLabourCode' ? codeToUse : material.wallLabourCode,
            ceilingLabourCode: slot.materialField === 'ceilingLabourCode' ? codeToUse : material.ceilingLabourCode,
            bulkheadLabourCode: slot.materialField === 'bulkheadLabourCode' ? codeToUse : material.bulkheadLabourCode,
            type: material.type,
            description: material.description,
            section: material.section,
            sizes: material.sizes,
            unitPrice: material.unitPrice,
            qty1Formula: material.qty1Formula,
            uom1: material.uom1,
            qty2Formula: material.qty2Formula,
            uom2: material.uom2,
            qty1FormulaCeiling: material.qty1FormulaCeiling,
            uom1Ceiling: material.uom1Ceiling,
            qty2FormulaCeiling: material.qty2FormulaCeiling,
            uom2Ceiling: material.uom2Ceiling,
            notes: material.notes,
          }),
        });
        const patchJson = await patchRes.json();
        if (!patchJson.success) {
          setBandError(patchJson.error ?? 'Band saved, but failed to link code to this material');
          return;
        }
        current = patchJson.data;
        onUpdated(current);
      }

      await refreshLabourMatches(current);
      setOpenSlot(null);
    } finally {
      setBandSaving(false);
    }
  }

  const slots = material ? buildSlots(material) : [];

  return (
    <Sheet open={!!material} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="2xl" className="w-full flex flex-col p-0 gap-0">
        {material && (
          <>
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 flex items-start gap-3 shrink-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 shrink-0 mt-0.5">
                <Package className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetHeader>
                  <SheetTitle className="text-white text-base leading-tight">
                    {material.description || material.code}
                  </SheetTitle>
                  <SheetDescription className="text-slate-400 text-xs mt-1">
                    <code className="font-mono bg-slate-700 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] mr-2">
                      {material.code}
                    </code>
                    {material.category}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="success">{material.parentSection}</Badge>
                  {material.section && (
                    <Badge variant="outline" className="text-slate-300 border-slate-600 bg-transparent text-[10px]">
                      {material.section}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-5">

                {/* Identity */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Identity</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow label="Code" value={material.code} />
                    <DetailRow label="Assembly Code" value={material.assemblyCode} />
                    <DetailRow label="Type" value={material.type} />
                    <DetailRow label="Category" value={material.category} />
                    <DetailRow label="Section" value={material.section} />
                    <DetailRow label="Parent Section" value={material.parentSection} />
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Pricing &amp; Units</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                    <DetailRow label="Unit Price" value={material.unitPrice === 0 ? '—' : `$${material.unitPrice.toFixed(4)}`} />
                  </div>
                </div>

                {/* Sizes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Sizes</p>
                    </div>
                    {!isAdding && (
                      <button
                        type="button"
                        onClick={startAdd}
                        className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
                      >
                        <Plus size={11} />
                        Add Size
                      </button>
                    )}
                  </div>
                  {material.sizes.length === 0 && !isAdding ? (
                    <p className="text-xs text-muted-foreground italic px-1">No sizes defined.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Size</th>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Num</th>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Container</th>
                            <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Unit Price</th>
                            {isAdding && <th className="w-12" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {material.sizes.map((s, i) => (
                            <tr key={i} className="hover:bg-muted/30 transition-colors">
                              <td className="px-2.5 py-1.5 font-medium text-foreground">{s.size || '—'}</td>
                              <td className="px-2.5 py-1.5 tabular-nums text-muted-foreground">{s.sizeNum || '—'}</td>
                              <td className="px-2.5 py-1.5 text-muted-foreground">{s.containerUnit || '—'}</td>
                              <td className="px-2.5 py-1.5 tabular-nums text-right text-muted-foreground">
                                ${(s.unitPrice ?? 0).toFixed(2)}
                              </td>
                              {isAdding && <td />}
                            </tr>
                          ))}
                          {isAdding && (
                            <tr className="bg-emerald-50/40">
                              <td className="px-2 py-1.5">
                                <input
                                  autoFocus
                                  className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                  value={newSize.size}
                                  onChange={(e) => set('size', e.target.value)}
                                  placeholder="10'"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                  value={newSize.sizeNum}
                                  onChange={(e) => set('sizeNum', e.target.value)}
                                  placeholder="10"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                  value={newSize.containerUnit}
                                  onChange={(e) => set('containerUnit', e.target.value)}
                                  placeholder="Piece"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-0.5">
                                  <span className="text-xs text-slate-400 shrink-0">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                    value={newSize.unitPrice}
                                    onChange={(e) => set('unitPrice', e.target.value)}
                                    placeholder="0.00"
                                  />
                                </div>
                              </td>
                              <td className="px-1.5 py-1.5">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={handleSaveSize}
                                    disabled={saving}
                                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-emerald-100 text-emerald-600 disabled:opacity-50"
                                    title="Save"
                                  >
                                    <Check size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelAdd}
                                    disabled={saving}
                                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-50"
                                    title="Cancel"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {error && <p className="text-[11px] text-red-600 mt-1.5">{error}</p>}
                </div>

                {/* Labour links — the raw code references */}
                {(material.wallLabourCode || material.ceilingLabourCode || material.bulkheadLabourCode) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Labour Links</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg px-3 divide-y divide-border">
                      <DetailRow label="Wall Labour" value={material.wallLabourCode} />
                      <DetailRow label="Ceiling Labour" value={material.ceilingLabourCode} />
                      <DetailRow label="Bulkhead Labour" value={material.bulkheadLabourCode} />
                    </div>
                  </div>
                )}

                {/* Labour Band — resolved live from the Labour Database, bifurcated
                    per link. Wall, Ceiling, and Bulkhead are kept fully separate:
                    each has its own matches and its own "+ Add" that creates a row
                    scoped to that section only. */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Hammer className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Labour Band</p>
                  </div>

                  <div className="space-y-4">
                    {slots.map((slot) => {
                      const bands = matchesByCode[slot.code.trim().toLowerCase()] ?? [];
                      const isOpen = openSlot === slot.key;
                      return (
                        <div key={slot.key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-semibold text-slate-600">{slot.label}</p>
                              {slot.code && (
                                <code className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  {slot.code}
                                </code>
                              )}
                            </div>
                            {!isOpen && (
                              <button
                                type="button"
                                onClick={() => startAddBand(slot)}
                                className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
                              >
                                <Plus size={11} />
                                Add
                              </button>
                            )}
                          </div>

                          {isLoadingBands ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                                <thead className="bg-muted/60">
                                  <tr>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Child Code</th>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">HT Band</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Min Ft</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Max Ft</th>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">UOM</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {[0, 1, 2].map((i) => (
                                    <tr key={i}>
                                      <td className="px-2.5 py-2"><Skeleton className="h-4 w-28 rounded" /></td>
                                      <td className="px-2.5 py-2"><Skeleton className="h-4 w-16 rounded" /></td>
                                      <td className="px-2.5 py-2 text-right"><Skeleton className="h-4 w-8 rounded ml-auto" /></td>
                                      <td className="px-2.5 py-2 text-right"><Skeleton className="h-4 w-8 rounded ml-auto" /></td>
                                      <td className="px-2.5 py-2"><Skeleton className="h-4 w-10 rounded" /></td>
                                      <td className="px-2.5 py-2 text-right"><Skeleton className="h-4 w-14 rounded ml-auto" /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : bands.length === 0 && !isOpen ? (
                            <p className="text-[11px] text-muted-foreground italic px-1">
                              {slot.code ? 'No bands found in the Labour Database for this code.' : 'No labour code linked yet.'}
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                                <thead className="bg-muted/60">
                                  <tr>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Child Code</th>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">HT Band</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Min Ft</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Max Ft</th>
                                    <th className="text-left px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">UOM</th>
                                    <th className="text-right px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rate</th>
                                    {isOpen && <th className="w-12" />}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {bands.map((b, i) => (
                                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                                      <td className="px-2.5 py-1.5">
                                        <code className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                          {b.labourCode || '—'}
                                        </code>
                                      </td>
                                      <td className="px-2.5 py-1.5 text-muted-foreground">{b.htBand || 'All'}</td>
                                      <td className="px-2.5 py-1.5 tabular-nums text-right text-muted-foreground">{b.htMinFt}</td>
                                      <td className="px-2.5 py-1.5 tabular-nums text-right text-muted-foreground">
                                        {b.htMaxFt < 99 ? b.htMaxFt : '∞'}
                                      </td>
                                      <td className="px-2.5 py-1.5 text-muted-foreground">{b.uom || '—'}</td>
                                      <td className="px-2.5 py-1.5 tabular-nums text-right font-medium text-foreground">
                                        {b.ratePerUom === 0 ? '—' : `$${b.ratePerUom.toFixed(4)}`}
                                      </td>
                                      {isOpen && <td />}
                                    </tr>
                                  ))}
                                  {isOpen && (
                                    <tr className="bg-emerald-50/40">
                                      <td className="px-2 py-1.5">
                                        <input
                                          autoFocus
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.labourCode}
                                          onChange={(e) => setBandField('labourCode', e.target.value)}
                                          placeholder="LAB-HNG-STD"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <select
                                          autoFocus={false}
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.htBand}
                                          onChange={(e) => setBandField('htBand', e.target.value)}
                                        >
                                          {HT_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input
                                          type="number"
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.htMinFt}
                                          onChange={(e) => setBandField('htMinFt', e.target.value)}
                                        />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input
                                          type="number"
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.htMaxFt}
                                          onChange={(e) => setBandField('htMaxFt', e.target.value)}
                                        />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.uom}
                                          onChange={(e) => setBandField('uom', e.target.value)}
                                          placeholder="SF"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input
                                          type="number"
                                          step="0.01"
                                          className="w-full h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                          value={newBand.ratePerUom}
                                          onChange={(e) => setBandField('ratePerUom', e.target.value)}
                                          placeholder="0.00"
                                        />
                                      </td>
                                      <td className="px-1.5 py-1.5">
                                        <div className="flex items-center gap-0.5">
                                          <button
                                            type="button"
                                            onClick={() => handleSaveBand(slot)}
                                            disabled={bandSaving}
                                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-emerald-100 text-emerald-600 disabled:opacity-50"
                                            title="Save"
                                          >
                                            <Check size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelAddBand}
                                            disabled={bandSaving}
                                            className="flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-50"
                                            title="Cancel"
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {isOpen && bandError && <p className="text-[11px] text-red-600 mt-1.5">{bandError}</p>}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-400 mt-3">
                    New bands are added directly to the Labour Database. If a section has no code linked yet, adding a band also links the new code to that section on this material.
                  </p>
                </div>

                {/* Formulas */}
                {(material.qty1Formula || material.qty1FormulaCeiling) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Formulas</p>
                    </div>
                    <div className="space-y-3">
                      {(material.qty1Formula || material.qty2Formula) && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground font-medium">Wall</p>
                          <FormulaBlock label="QTY 1" formula={material.qty1Formula} uom={material.uom1} />
                          <FormulaBlock label="QTY 2" formula={material.qty2Formula} uom={material.uom2} />
                        </div>
                      )}
                      {(material.qty1FormulaCeiling || material.qty2FormulaCeiling) && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <p className="text-[10px] text-muted-foreground font-medium">Ceiling</p>
                            <FormulaBlock label="QTY 1" formula={material.qty1FormulaCeiling} uom={material.uom1Ceiling} />
                            <FormulaBlock label="QTY 2" formula={material.qty2FormulaCeiling} uom={material.uom2Ceiling} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {material.notes && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">Notes</p>
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 leading-relaxed">
                      {material.notes}
                    </p>
                  </div>
                )}

              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

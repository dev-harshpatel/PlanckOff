'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Database, Hammer, Layers, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shadcn/dialog';
import {
  parseMaterialsExcel,
  parseLabourExcel,
  parseAssemblyBunchesExcel,
  type MaterialImportRow,
  type LabourImportRow,
  type AssemblyBunchImportRow,
  type ImportType,
} from '@/lib/utils/databaseImportParsers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = MaterialImportRow | LabourImportRow | AssemblyBunchImportRow;

type Step = 'select' | 'preview' | 'uploading' | 'done';

interface ImportStats {
  added?: number;
  updated?: number;
  unchanged?: number;
  total?: number;
  branchesReplaced?: number;
  branchesUnchanged?: number;
  rowsInserted?: number;
}

interface DatabaseUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ImportType, {
  label: string;
  description: string;
  icon: React.ReactNode;
  sheetHint: string;
  previewCols: string[];
  getPreviewRow: (row: ParsedRow) => string[];
}> = {
  materials: {
    label: 'Materials',
    description: 'Drywall, framing, and related materials',
    icon: <Database className="w-4 h-4" />,
    sheetHint: 'Sheet: "Material Data"',
    previewCols: ['Code', 'Category', 'Type', 'Description', 'Unit Price'],
    getPreviewRow: (row) => {
      const r = row as MaterialImportRow;
      return [r.code, r.category, r.type, r.description, `$${r.unit_price}`];
    },
  },
  labour: {
    label: 'Labour',
    description: 'Labour rates by code and height band',
    icon: <Hammer className="w-4 h-4" />,
    sheetHint: 'Sheet: "Labour Data"',
    previewCols: ['Description', 'Category', 'Height Bands', 'UOM', 'Rate Range'],
    getPreviewRow: (row) => {
      const r = row as LabourImportRow;
      const bands = r.labour_bands;
      const rates = bands.map((b) => b.ratePerUom);
      const rateRange = rates.length
        ? (Math.min(...rates) === Math.max(...rates)
          ? `$${Math.min(...rates)}`
          : `$${Math.min(...rates)}–$${Math.max(...rates)}`)
        : '';
      return [
        r.description,
        r.category,
        bands.map((b) => b.htBand).join(', '),
        bands[0]?.uom ?? '',
        rateRange,
      ];
    },
  },
  'assembly-bunches': {
    label: 'Assembly Bunches',
    description: 'Branch-level assembly definitions',
    icon: <Layers className="w-4 h-4" />,
    sheetHint: 'Sheet: "by default assembly branch"',
    previewCols: ['Branch', 'Assembly Code', 'Item Code', 'Description', 'Section'],
    getPreviewRow: (row) => {
      const r = row as AssemblyBunchImportRow;
      return [r.branch_code, r.assembly_code, r.item_code, r.description, r.section];
    },
  },
};

const ACCEPT = '.xlsx,.xls';

// ─── Component ────────────────────────────────────────────────────────────────

export function DatabaseUploadModal({ open, onOpenChange, onSuccess }: DatabaseUploadModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedType, setSelectedType] = useState<ImportType>('materials');
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('select');
    setParseError(null);
    setParsedRows([]);
    setFileName('');
    setStats(null);
    setUploadError(null);
    setIsDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Delay reset so the closing animation plays first
    setTimeout(reset, 300);
  }, [onOpenChange, reset]);

  const parseFile = useCallback(async (file: File) => {
    setParseError(null);
    setFileName(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls'].includes(ext)) {
      setParseError('Please upload a .xlsx or .xls file.');
      return;
    }

    try {
      const ab = await file.arrayBuffer();
      let result: { rows: ParsedRow[] };

      if (selectedType === 'materials') {
        result = parseMaterialsExcel(ab);
      } else if (selectedType === 'labour') {
        result = parseLabourExcel(ab);
      } else {
        result = parseAssemblyBunchesExcel(ab);
      }

      if (result.rows.length === 0) {
        setParseError('No valid rows found in the file. Check that the sheet name and column headers are correct.');
        return;
      }

      setParsedRows(result.rows);
      setStep('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      setParseError(msg);
    }
  }, [selectedType]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }, [parseFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleApply = useCallback(async () => {
    if (parsedRows.length === 0) return;
    setStep('uploading');
    setUploadError(null);

    try {
      const res = await fetch('/api/database-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, rows: parsedRows }),
      });
      const json = await res.json();

      if (!json.success) {
        setUploadError(json.error ?? 'Import failed. Please try again.');
        setStep('preview');
        return;
      }

      setStats(json.data);
      setStep('done');
      onSuccess();
    } catch {
      setUploadError('Network error. Please check your connection and try again.');
      setStep('preview');
    }
  }, [parsedRows, selectedType, onSuccess]);

  const config = TYPE_CONFIG[selectedType];
  const previewRows = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-slate-900 px-6 py-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Upload className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-white text-base">
                  {step === 'done' ? 'Import Complete' : 'Import Database'}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs mt-0.5">
                  {step === 'select' && 'Upload an Excel file to update reference data'}
                  {step === 'preview' && `${parsedRows.length} rows parsed — review before applying`}
                  {step === 'uploading' && 'Comparing and applying changes...'}
                  {step === 'done' && 'Changes have been saved to the database'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ── Select step ─────────────────────────────────────────────────── */}
        {step === 'select' && (
          <div className="p-6 flex flex-col gap-5">
            {/* Type selector */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                Database Type
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(TYPE_CONFIG) as [ImportType, typeof TYPE_CONFIG[ImportType]][]).map(
                  ([type, cfg]) => (
                    <button
                      key={type}
                      onClick={() => { setSelectedType(type); setParseError(null); }}
                      className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ${
                        selectedType === type
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${selectedType === type ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {cfg.icon}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${selectedType === type ? 'text-emerald-800' : 'text-slate-700'}`}>
                          {cfg.label}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{cfg.description}</p>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Drop zone */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                Upload File
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDragging ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  <FileSpreadsheet className={`w-6 h-6 ${isDragging ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">
                    {isDragging ? 'Drop to upload' : 'Drag & drop your Excel file here'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    or <span className="text-emerald-600 font-medium">click to browse</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    .xlsx
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    .xls
                  </span>
                  <span className="text-[10px] text-slate-400">•</span>
                  <span className="text-[10px] text-slate-400">{config.sheetHint}</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={handleFileInput}
                />
              </div>

              {parseError && (
                <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{parseError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Preview step ─────────────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="flex flex-col">
            {/* Stats bar */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="text-xs font-medium truncate max-w-[160px]">{fileName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    {parsedRows.length.toLocaleString()} rows parsed
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    {config.label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setStep('select'); setParsedRows([]); setParseError(null); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Change file
              </button>
            </div>

            {/* Preview table */}
            <div className="px-6 pt-4 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Preview (first {Math.min(previewRows.length, 5)} of {parsedRows.length} rows)
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {config.previewCols.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {config.getPreviewRow(row).map((val, j) => (
                          <td
                            key={j}
                            className="px-3 py-2 text-slate-700 max-w-[140px] truncate"
                            title={val}
                          >
                            {val || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {parsedRows.length > 5 && (
                      <tr>
                        <td
                          colSpan={config.previewCols.length}
                          className="px-3 py-2 text-center text-slate-400"
                        >
                          + {(parsedRows.length - 5).toLocaleString()} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Info note */}
            <div className="px-6 py-3">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">What happens:</span>{' '}
                {selectedType === 'assembly-bunches'
                  ? 'Branches present in the file will have all their rows replaced. Branches not in the file will remain unchanged.'
                  : 'New rows will be inserted. Existing rows with the same key will be updated only if values changed. Other rows remain untouched.'}
              </p>
            </div>

            {uploadError && (
              <div className="mx-6 mb-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{uploadError}</p>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                onClick={() => { setStep('select'); setParsedRows([]); }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Apply Changes
              </button>
            </div>
          </div>
        )}

        {/* ── Uploading step ───────────────────────────────────────────────── */}
        {step === 'uploading' && (
          <div className="px-6 py-14 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Applying changes...</p>
              <p className="text-xs text-slate-400 mt-1">
                Comparing {parsedRows.length.toLocaleString()} rows with the database
              </p>
            </div>
          </div>
        )}

        {/* ── Done step ───────────────────────────────────────────────────── */}
        {step === 'done' && stats && (
          <div className="px-6 py-8 flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>

            {/* Stats grid */}
            {selectedType !== 'assembly-bunches' ? (
              <div className="w-full grid grid-cols-3 gap-3">
                <StatCard
                  value={stats.added ?? 0}
                  label="Rows Added"
                  color="emerald"
                />
                <StatCard
                  value={stats.updated ?? 0}
                  label="Rows Updated"
                  color="amber"
                />
                <StatCard
                  value={stats.unchanged ?? 0}
                  label="Unchanged"
                  color="slate"
                />
              </div>
            ) : (
              <div className="w-full grid grid-cols-2 gap-3">
                <StatCard
                  value={stats.branchesReplaced ?? 0}
                  label="Branches Replaced"
                  color="emerald"
                />
                <StatCard
                  value={stats.branchesUnchanged ?? 0}
                  label="Branches Unchanged"
                  color="slate"
                />
              </div>
            )}

            <p className="text-xs text-slate-500 text-center">
              {selectedType !== 'assembly-bunches'
                ? `${stats.total?.toLocaleString()} total rows processed from "${fileName}"`
                : `${stats.rowsInserted?.toLocaleString()} rows inserted from "${fileName}"`}
            </p>

            {/* Footer */}
            <div className="flex items-center gap-3 w-full justify-center pt-2">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Import Another
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: 'emerald' | 'amber' | 'slate';
}) {
  const colorMap = {
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      value: 'text-emerald-700',
      label: 'text-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      value: 'text-amber-700',
      label: 'text-amber-600',
    },
    slate: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      value: 'text-slate-700',
      label: 'text-slate-500',
    },
  };
  const c = colorMap[color];

  return (
    <div className={`flex flex-col items-center justify-center gap-1 py-4 rounded-xl border ${c.bg} ${c.border}`}>
      <span className={`text-3xl font-bold tabular-nums ${c.value}`}>
        {value.toLocaleString()}
      </span>
      <span className={`text-xs font-medium ${c.label}`}>{label}</span>
    </div>
  );
}

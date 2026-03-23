'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Filter } from 'lucide-react';
import { Button, Modal, ModalBody, ModalFooter } from '@/components/ui';
import { exportToExcel, exportToPdf } from '@/lib/utils/exportUtils';
import type { ExportColumnDef, ExportRow } from '@/lib/utils/exportUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  sheetName: string;
  columns: ExportColumnDef[];
  rows: ExportRow[];
  summaryRows?: ExportRow[];
  /** True when any filter is currently active */
  filtersActive: boolean;
}

type ExportFormat = 'excel' | 'pdf';

export const ExportModal = ({
  isOpen,
  onClose,
  filename,
  sheetName,
  columns,
  rows,
  summaryRows,
  filtersActive,
}: ExportModalProps) => {
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultEnabled).map((c) => c.key))
  );
  const [isExporting, setIsExporting] = useState(false);

  // Re-sync defaults when columns change (tab switch)
  const defaultKeys = useMemo(
    () => new Set(columns.filter((c) => c.defaultEnabled).map((c) => c.key)),
    [columns]
  );

  // Reset on open
  const handleOpen = useCallback(() => {
    setEnabledKeys(new Set(defaultKeys));
    setFormat('excel');
    setIsExporting(false);
  }, [defaultKeys]);

  React.useEffect(() => {
    if (isOpen) handleOpen();
  }, [isOpen, handleOpen]);

  const toggleColumn = useCallback((key: string) => {
    setEnabledKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllColumns = useCallback(() => {
    setEnabledKeys(new Set(columns.map((c) => c.key)));
  }, [columns]);

  const deselectAllColumns = useCallback(() => {
    setEnabledKeys(new Set());
  }, []);

  const enabledCount = enabledKeys.size;
  const canExport = enabledCount > 0 && rows.length > 0;

  const handleExport = useCallback(async () => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      const config = { filename, sheetName, columns, rows, summaryRows };
      if (format === 'excel') {
        await exportToExcel(config, enabledKeys);
      } else {
        await exportToPdf(config, enabledKeys);
      }
      onClose();
    } finally {
      setIsExporting(false);
    }
  }, [canExport, format, filename, sheetName, columns, rows, summaryRows, enabledKeys, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Data" size="lg" closeOnOverlayClick>
      <ModalBody>
        <div className="flex flex-col gap-6">

          {/* Format selector */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Export Format
            </span>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    value: 'excel' as ExportFormat,
                    label: 'Excel',
                    ext: '.xlsx',
                    Icon: FileSpreadsheet,
                    active: 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400',
                    iconColor: 'text-emerald-600',
                  },
                  {
                    value: 'pdf' as ExportFormat,
                    label: 'PDF',
                    ext: '.pdf',
                    Icon: FileText,
                    active: 'bg-red-50 border-red-400 ring-1 ring-red-400',
                    iconColor: 'text-red-500',
                  },
                ] as const
              ).map(({ value, label, ext, Icon, active, iconColor }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                    format === value
                      ? active
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={22} className={format === value ? iconColor : 'text-slate-400'} />
                  <div>
                    <div className={`text-sm font-semibold ${format === value ? 'text-slate-800' : 'text-slate-600'}`}>
                      {label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">{ext}</div>
                  </div>
                  {format === value && (
                    <div className="ml-auto w-4 h-4 rounded-full bg-current flex items-center justify-center"
                      style={{ color: value === 'excel' ? '#059669' : '#ef4444' }}>
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Column selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Columns to Include
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAllColumns}
                  className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAllColumns}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-3 bg-slate-50 rounded-lg border border-slate-200">
              {columns.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 py-1.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={enabledKeys.has(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-700 group-hover:text-slate-900 transition-colors">
                    {col.label}
                  </span>
                </label>
              ))}
            </div>
            {enabledCount === 0 && (
              <p className="text-xs text-red-500 mt-1">Select at least one column to export.</p>
            )}
          </div>

          {/* Summary bar */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs ${
            filtersActive
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-slate-50 border border-slate-200 text-slate-600'
          }`}>
            {filtersActive && <Filter size={12} className="text-amber-500 shrink-0" />}
            <span>
              Exporting <strong>{rows.length.toLocaleString()}</strong> row{rows.length !== 1 ? 's' : ''}
              {filtersActive && (
                <span className="ml-1 text-amber-700">— filtered view</span>
              )}
              {enabledCount > 0 && (
                <span className="ml-1 text-slate-400">
                  · {enabledCount} column{enabledCount !== 1 ? 's' : ''}
                </span>
              )}
              {summaryRows && summaryRows.length > 0 && (
                <span className="ml-1 text-slate-400">
                  · {summaryRows.length} summary row{summaryRows.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>

        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleExport}
          isLoading={isExporting}
          disabled={!canExport}
        >
          {isExporting ? 'Exporting…' : `Export as ${format === 'excel' ? 'Excel' : 'PDF'}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

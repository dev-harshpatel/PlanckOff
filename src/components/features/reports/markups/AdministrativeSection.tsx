'use client';

import React, { useCallback } from 'react';
import { Plus } from 'lucide-react';

import { NumberInput } from '@/components/ui';
import { calcAdministrativeRowTotal } from './formulas';
import type { AdministrativeField, AdministrativeFormulaType, AdministrativeRow } from './types';

interface AdministrativeSectionProps {
  rows: AdministrativeRow[];
  durationWeeks: number;
  onRowChange: (id: string, field: AdministrativeField, value: string | number | boolean) => void;
  onAddCustomRow: () => void;
  onRemoveRow: (id: string) => void;
  currencySymbol?: string;
}

const INPUT_CLS =
  'text-center text-xs border border-slate-200 rounded px-1 py-1 ' +
  'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums';

const QTY_W = 'w-12';
const RATE_W = 'w-16';
const BIG_W = 'w-20';
const DUR_W = 'w-16';

interface AdminRowInputsProps {
  row: AdministrativeRow;
  durationWeeks: number;
  onChange: (field: AdministrativeField, value: string | number | boolean) => void;
}

function AdminRowInputs({ row, durationWeeks, onChange }: AdminRowInputsProps) {
  const n = (
    field: AdministrativeField,
    width: string,
    placeholder: string,
    isFloat = true,
    value?: number,
  ) => (
    <NumberInput
      cellMode
      type={isFloat ? 'float' : 'int'}
      value={value ?? (row[field] as number)}
      onChange={(v) => onChange(field, v ?? 0)}
      className={`${width} ${INPUT_CLS}`}
      placeholder={placeholder}
    />
  );

  const lbl = (s: string) => (
    <span className="text-[10px] text-slate-500 shrink-0">{s}</span>
  );

  const op = (s: string) => (
    <span className="text-[10px] text-slate-400 shrink-0 select-none">{s}</span>
  );

  const effectiveDurationWeeks = row.durationWeeks > 0 ? row.durationWeeks : durationWeeks;

  const durationInput = (
    <div className="flex items-center gap-1 shrink-0">
      <NumberInput
        cellMode
        type="float"
        value={effectiveDurationWeeks}
        onChange={(v) => onChange('durationWeeks', v ?? 0)}
        className={`${DUR_W} text-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-1 outline-none tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500`}
        placeholder={durationWeeks > 0 ? durationWeeks.toString() : '0'}
      />
      <span className="text-xs font-semibold text-emerald-700">wks</span>
    </div>
  );

  switch (row.formulaType as AdministrativeFormulaType) {
    case 'lump_sum':
      return (
        <div className="flex items-center gap-1">
          {lbl('$')}
          {n('amount', BIG_W, '0')}
          {lbl('lump sum')}
        </div>
      );
    case 'parking_monthly':
      return (
        <div className="flex items-center gap-1">
          {n('parkingSpots', QTY_W, '0', false)}
          {lbl('spots')}
          {op('×')}
          {n('months', QTY_W, '0')}
          {lbl('mo')}
          {op('×')}
          {lbl('$')}
          {n('monthlyParkingCost', RATE_W, '0')}
          {lbl('/mo')}
        </div>
      );
    case 'weekly_budget':
      return (
        <div className="flex items-center gap-1">
          {durationInput}
          {op('×')}
          {lbl('$')}
          {n('weeklyBudget', RATE_W, '0')}
          {lbl('/wk')}
        </div>
      );
  }
}

export function AdministrativeSection({
  rows,
  durationWeeks,
  onRowChange,
  onAddCustomRow,
  onRemoveRow,
  currencySymbol = '$',
}: AdministrativeSectionProps) {
  const formatCurrency = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const grandTotal = rows.reduce(
    (sum, row) => sum + calcAdministrativeRowTotal(row, durationWeeks),
    0,
  );

  const ROW_GRID = 'grid items-center gap-x-4 py-2.5 px-2 hover:bg-slate-50 transition-colors';
  const GRID_COLS = { gridTemplateColumns: '1fr 430px 80px 32px' };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Administrative
        </h4>
      </div>

      <div className={ROW_GRID} style={GRID_COLS}>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Item
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">
          Details
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">
          Amount
        </span>
        <span />
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const rowTotal = calcAdministrativeRowTotal(row, durationWeeks);

          return (
            <div key={row.id} className={ROW_GRID} style={GRID_COLS}>
              {row.isCustom ? (
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => onRowChange(row.id, 'label', e.target.value)}
                  className="w-full bg-transparent border border-slate-200 rounded px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              ) : (
                <span className="text-xs font-medium text-slate-700 leading-snug">
                  {row.label}
                </span>
              )}

              <div className="flex items-center justify-end">
                <AdminRowInputs
                  row={row}
                  durationWeeks={durationWeeks}
                  onChange={(field, value) => onRowChange(row.id, field, value)}
                />
              </div>

              <div className="text-right text-xs font-semibold tabular-nums">
                {rowTotal > 0
                  ? <span className="text-slate-800">{currencySymbol}{formatCurrency(rowTotal)}</span>
                  : <span className="text-slate-300">—</span>
                }
              </div>

              <button
                type="button"
                onClick={() => onRemoveRow(row.id)}
                className={row.isCustom ? 'text-slate-300 hover:text-red-500 p-1' : 'invisible p-1'}
                aria-label={row.isCustom ? 'Remove administrative item' : undefined}
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>

      <div className={`${ROW_GRID} border-t-2 border-slate-200 mt-0.5`} style={GRID_COLS}>
        <span className="text-xs font-bold text-slate-600 col-span-2">
          Administrative Subtotal
        </span>
        <span className="text-xs font-bold text-slate-800 tabular-nums text-right">
          {currencySymbol}{formatCurrency(grandTotal)}
        </span>
        <span />
      </div>

      <button
        type="button"
        onClick={onAddCustomRow}
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium hover:underline pl-1"
      >
        <Plus size={12} />
        Add Administrative Item
      </button>
    </div>
  );
}

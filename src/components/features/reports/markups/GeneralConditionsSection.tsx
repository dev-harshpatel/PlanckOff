'use client';

import React, { useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

import { NumberInput } from '@/components/ui';
import {
  calcGcRowTotal,
  type GcFormulaType,
  type GcNumericField,
  type GeneralConditionsRow,
} from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GeneralConditionsSectionProps {
  rows: GeneralConditionsRow[];
  durationWeeks: number;
  durationMonths: number;
  onRowChange: (id: string, field: GcNumericField, value: number) => void;
  currencySymbol?: string;
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT_CLS =
  'text-center text-xs border border-slate-200 rounded px-1 py-1 ' +
  'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums';

// Standardised input widths — consistent across ALL formula types
const QTY_W  = 'w-12';   // small integer: cleaners, units, months, occurrences
const RATE_W = 'w-16';   // dollar rate: /hr, /mo, /unit
const BIG_W  = 'w-20';   // larger value: lump sum, SF, weekly expense

// ─── Inline formula input renderer ───────────────────────────────────────────

interface GcRowInputsProps {
  row: GeneralConditionsRow;
  durationWeeks: number;
  durationMonths: number;
  onChange: (field: GcNumericField, value: number) => void;
}

/**
 * Renders the compact inline input group for a row.
 * All cases must fit comfortably within the fixed 370px input column.
 */
function GcRowInputs({ row, durationWeeks, durationMonths, onChange }: GcRowInputsProps) {
  const n = (
    field: GcNumericField,
    width: string,
    placeholder: string,
    isFloat = true,
  ) => (
    <NumberInput
      cellMode
      type={isFloat ? 'float' : 'int'}
      value={row[field] as number}
      onChange={(v) => onChange(field, v ?? 0)}
      className={`${width} ${INPUT_CLS}`}
      placeholder={placeholder}
    />
  );

  // Tiny operator and label helpers — fixed-size, never wrap
  const op  = (s: string) => (
    <span className="text-[10px] text-slate-400 shrink-0 select-none">{s}</span>
  );
  const lbl = (s: string) => (
    <span className="text-[10px] text-slate-500 shrink-0">{s}</span>
  );

  const durBadge = durationWeeks > 0 ? (
    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
      {durationWeeks} wks
    </span>
  ) : (
    <span className="text-[10px] text-slate-300 border border-slate-200 rounded px-1.5 py-0.5 shrink-0">
      ? wks
    </span>
  );

  // Blue badge — auto-calculated months including partial days
  const mosBadge = durationMonths > 0 ? (
    <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
      {durationMonths.toFixed(2)} mo
    </span>
  ) : (
    <span className="text-[10px] text-slate-300 border border-slate-200 rounded px-1.5 py-0.5 shrink-0">
      ? mo
    </span>
  );

  // All cases: single flex row, no wrapping, right-aligned in parent
  switch (row.formulaType as GcFormulaType) {
    case 'lump_sum':
      return (
        <div className="flex items-center gap-1">
          {lbl('$')}
          {n('amount', BIG_W, '0')}
          {lbl('lump sum')}
        </div>
      );

    case 'duration_cleaners_rate':
      return (
        <div className="flex items-center gap-1">
          {n('cleaners', QTY_W, '0', false)}
          {lbl('cleaners')}
          {op('×')}
          {lbl('$')}
          {n('hourlyRate', RATE_W, '60')}
          {lbl('/hr')}
          {op('×')}
          {durBadge}
          {op('× 40')}
        </div>
      );

    case 'duration_weekly_expense':
      return (
        <div className="flex items-center gap-1">
          {lbl('$')}
          {n('weeklyExpense', RATE_W, '0')}
          {lbl('/wk')}
          {op('×')}
          {durBadge}
        </div>
      );

    case 'units_months_monthly_rate':
      return (
        <div className="flex items-center gap-1">
          {n('units', QTY_W, '0', false)}
          {lbl('units')}
          {op('×')}
          {mosBadge}
          {op('×')}
          {lbl('$')}
          {n('monthlyRate', RATE_W, '0')}
          {lbl('/mo')}
        </div>
      );

    case 'units_unit_rate':
      return (
        <div className="flex items-center gap-1">
          {n('units', QTY_W, '0', false)}
          {lbl('units')}
          {op('×')}
          {lbl('$')}
          {n('unitRate', RATE_W, '0')}
          {lbl('/unit')}
        </div>
      );

    case 'area_months_monthly_rate':
      return (
        <div className="flex items-center gap-1">
          {n('area', RATE_W, '0')}
          {lbl('SF')}
          {op('×')}
          {mosBadge}
          {op('×')}
          {lbl('$')}
          {n('monthlyRate', RATE_W, '0')}
          {lbl('/mo')}
        </div>
      );

    case 'months_units_monthly_rate':
      return (
        <div className="flex items-center gap-1">
          {mosBadge}
          {op('×')}
          {n('units', QTY_W, '0', false)}
          {lbl('filters')}
          {op('×')}
          {lbl('$')}
          {n('monthlyRate', RATE_W, '0')}
          {lbl('/mo')}
        </div>
      );

    case 'occurrences_hours_hourly_rate':
      return (
        <div className="flex items-center gap-1">
          {n('occurrences', QTY_W, '0', false)}
          {lbl('occ')}
          {op('×')}
          {n('hoursPerOccurrence', QTY_W, '4')}
          {lbl('hrs')}
          {op('×')}
          {lbl('$')}
          {n('hourlyRate', RATE_W, '250')}
          {lbl('/hr')}
        </div>
      );
  }
}

// ─── Section component ────────────────────────────────────────────────────────

export function GeneralConditionsSection({
  rows,
  durationWeeks,
  durationMonths,
  onRowChange,
  currencySymbol = '$',
}: GeneralConditionsSectionProps) {
  const formatCurrency = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const grandTotal = rows.reduce(
    (sum, row) => sum + calcGcRowTotal(row, durationWeeks, durationMonths),
    0,
  );

  const durationDependentTypes: GcFormulaType[] = [
    'duration_cleaners_rate',
    'duration_weekly_expense',
  ];
  const hasDurationRows = rows.some((r) =>
    durationDependentTypes.includes(r.formulaType as GcFormulaType),
  );

  // Grid column template: label takes remaining space, inputs fixed, total fixed
  const ROW_GRID = 'grid items-center gap-x-4 py-2.5 px-2 hover:bg-slate-50 transition-colors';
  const GRID_COLS = { gridTemplateColumns: '1fr 370px 80px' };

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-1 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          General Conditions
        </h4>
        {hasDurationRows && durationWeeks === 0 && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={11} />
            <span className="text-[10px] font-medium">Some rows need project dates</span>
          </div>
        )}
      </div>

      {/* Column labels — align with data rows */}
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
      </div>

      {/* Data rows */}
      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const rowTotal = calcGcRowTotal(row, durationWeeks, durationMonths);

          return (
            <div key={row.id} className={ROW_GRID} style={GRID_COLS}>
              {/* Label */}
              <span className="text-xs font-medium text-slate-700 leading-snug">
                {row.label}
              </span>

              {/* Inputs — right-aligned inside the fixed column */}
              <div className="flex items-center justify-end">
                <GcRowInputs
                  row={row}
                  durationWeeks={durationWeeks}
                  durationMonths={durationMonths}
                  onChange={(field, value) => onRowChange(row.id, field, value)}
                />
              </div>

              {/* Total */}
              <div className="text-right text-xs font-semibold tabular-nums">
                {rowTotal > 0
                  ? <span className="text-slate-800">{currencySymbol}{formatCurrency(rowTotal)}</span>
                  : <span className="text-slate-300">—</span>
                }
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtotal — aligned to the same grid */}
      <div className={`${ROW_GRID} border-t-2 border-slate-200 mt-0.5`} style={GRID_COLS}>
        <span className="text-xs font-bold text-slate-600 col-span-2">
          General Conditions Subtotal
        </span>
        <span className="text-xs font-bold text-slate-800 tabular-nums text-right">
          {currencySymbol}{formatCurrency(grandTotal)}
        </span>
      </div>
    </div>
  );
}

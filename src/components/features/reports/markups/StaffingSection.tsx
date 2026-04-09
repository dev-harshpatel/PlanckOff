'use client';

import React, { useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

import { NumberInput } from '@/components/ui';
import { calcStaffingRowTotal } from './formulas';
import type { StaffingRow } from './types';

interface StaffingSectionProps {
  rows: StaffingRow[];
  durationWeeks: number;
  workingHoursPerWeek: number;
  onRowChange: (id: string, field: 'workers' | 'percentTime' | 'hourlyRate' | 'durationWeeks', value: number) => void;
  currencySymbol?: string;
}

export function StaffingSection({
  rows,
  durationWeeks,
  workingHoursPerWeek,
  onRowChange,
  currencySymbol = '$',
}: StaffingSectionProps) {
  const formatCurrency = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const grandTotal = rows.reduce(
    (sum, row) => sum + calcStaffingRowTotal(row, durationWeeks, workingHoursPerWeek),
    0,
  );

  const noDuration = durationWeeks === 0;
  const durationInputClass =
    'w-14 text-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 ' +
    'rounded px-2 py-1 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums';

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Staffing / Supervision
        </h4>

        {noDuration && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={11} />
            <span className="text-[10px] font-medium">
              Enter project duration or row overrides to calculate totals
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-2 pl-1 text-left text-xs font-semibold text-slate-400 w-[32%]">
                Role
              </th>
              <th className="py-2 text-center text-xs font-semibold text-slate-400 w-[12%]">
                Rate / Hr
              </th>
              <th className="py-2 text-center text-xs font-semibold text-slate-400 w-[16%]">
                # Workers
              </th>
              <th className="py-2 text-center text-xs font-semibold text-slate-400 w-[16%]">
                % Time
              </th>
              <th className="py-2 text-center text-xs font-semibold text-slate-400 w-[12%]">
                Duration
              </th>
              <th className="py-2 pr-1 text-right text-xs font-semibold text-slate-400 w-[12%]">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const rowTotal = calcStaffingRowTotal(row, durationWeeks, workingHoursPerWeek);
              const effectiveDurationWeeks = row.durationWeeks > 0 ? row.durationWeeks : durationWeeks;

              return (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  {/* Role label */}
                  <td className="py-2 pl-1">
                    <span className="text-xs font-medium text-slate-700">{row.label}</span>
                  </td>

                  {/* Hourly rate — editable */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-slate-400 shrink-0">$</span>
                      <NumberInput
                        cellMode
                        type="float"
                        value={row.hourlyRate}
                        onChange={(v) => onRowChange(row.id, 'hourlyRate', v ?? 0)}
                        className="w-full text-center text-xs border border-slate-200 rounded px-1 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400 shrink-0">/hr</span>
                    </div>
                  </td>

                  {/* Workers — editable */}
                  <td className="py-2 px-2">
                    <NumberInput
                      cellMode
                      type="int"
                      value={row.workers}
                      onChange={(v) => onRowChange(row.id, 'workers', v ?? 0)}
                      className="w-full text-center text-xs border border-slate-200 rounded px-1 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums"
                      placeholder="0"
                    />
                  </td>

                  {/* % Time — editable */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-0.5">
                      <NumberInput
                        cellMode
                        type="float"
                        value={row.percentTime}
                        onChange={(v) => onRowChange(row.id, 'percentTime', v ?? 0)}
                        className="w-full text-center text-xs border border-slate-200 rounded px-1 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums"
                        placeholder="100"
                      />
                      <span className="text-xs text-slate-400 shrink-0">%</span>
                    </div>
                  </td>

                  {/* Duration — read-only, from projectInfo */}
                  <td className="py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <NumberInput
                        cellMode
                        type="float"
                        value={effectiveDurationWeeks}
                        onChange={(v) => onRowChange(row.id, 'durationWeeks', v ?? 0)}
                        className={durationInputClass}
                        placeholder={durationWeeks > 0 ? durationWeeks.toString() : '0'}
                      />
                      <span className="text-xs font-semibold text-emerald-700">wks</span>
                    </div>
                  </td>

                  {/* Row total */}
                  <td className="py-2 pr-1 text-right text-xs font-semibold text-slate-800 tabular-nums">
                    {rowTotal > 0
                      ? `${currencySymbol}${formatCurrency(rowTotal)}`
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/70">
              <td colSpan={5} className="py-2 pl-1 text-xs font-bold text-slate-600">
                Staffing Subtotal
              </td>
              <td className="py-2 pr-1 text-right text-xs font-bold text-slate-800 tabular-nums">
                {currencySymbol}{formatCurrency(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Formula hint */}
      {!noDuration && (
        <p className="text-[10px] text-slate-400 mt-1 pl-1">
          Formula: Workers × (% Time / 100) × row duration × Rate × {workingHoursPerWeek} hrs/wk
        </p>
      )}
    </div>
  );
}

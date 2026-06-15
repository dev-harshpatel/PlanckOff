'use client';

import React, { useCallback } from 'react';

import { NumberInput } from '@/components/ui';
import { calcTravelHotel } from './formulas';
import type { TravelHotelConfig } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TravelHotelSectionProps {
  config: TravelHotelConfig;
  /** Total labour cost from the trade breakdown — read-only, flows from parent. */
  totalLaborCost: number;
  onChange: (config: TravelHotelConfig) => void;
  currencySymbol?: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT_CLS =
  'text-center text-xs border border-slate-200 rounded px-1 py-1 ' +
  'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums';

// ─── Component ────────────────────────────────────────────────────────────────

export function TravelHotelSection({
  config,
  totalLaborCost,
  onChange,
  currencySymbol = '$',
}: TravelHotelSectionProps) {
  const fmt = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const fmtDec = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  const set = useCallback(
    (field: keyof TravelHotelConfig, value: number) => {
      onChange({ ...config, [field]: value });
    },
    [config, onChange],
  );

  const derived = calcTravelHotel(config, totalLaborCost);

  // Grid: label takes remaining space, input/value fixed, amount fixed
  const ROW_GRID = 'grid items-center gap-x-4 py-2 px-2 hover:bg-slate-50 transition-colors';
  const GRID_COLS = { gridTemplateColumns: '1fr 220px 100px' };

  const inputRow = (
    label: string,
    field: keyof TravelHotelConfig,
    prefix: string,
    suffix: string,
    isFloat = true,
  ) => (
    <div className={ROW_GRID} style={GRID_COLS}>
      <span className="text-xs font-medium text-slate-700 leading-snug">{label}</span>
      <div className="flex items-center justify-end gap-1">
        {prefix && <span className="text-[10px] text-slate-400 shrink-0">{prefix}</span>}
        <NumberInput
          cellMode
          type={isFloat ? 'float' : 'int'}
          value={config[field]}
          onChange={(v) => set(field, v ?? 0)}
          className={`w-20 ${INPUT_CLS}`}
          placeholder="0"
        />
        {suffix && <span className="text-[10px] text-slate-500 shrink-0">{suffix}</span>}
      </div>
      <div className="text-right text-xs text-slate-300 tabular-nums">—</div>
    </div>
  );

  const calcRow = (label: string, value: number, isCurrency = true, decimals = false) => (
    <div className={ROW_GRID} style={GRID_COLS}>
      <span className="text-xs font-medium text-slate-500 leading-snug">{label}</span>
      <div className="flex items-center justify-end">
        <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded tabular-nums">
          {isCurrency
            ? `${currencySymbol}${fmt(value)}`
            : decimals
              ? fmtDec(value)
              : fmt(value)}
        </span>
      </div>
      <div className="text-right text-xs text-slate-300 tabular-nums">—</div>
    </div>
  );

  const costRow = (label: string, value: number) => (
    <div className={ROW_GRID} style={GRID_COLS}>
      <span className="text-xs font-medium text-slate-700 leading-snug">{label}</span>
      <div /> {/* empty middle */}
      <div className="text-right text-xs font-semibold tabular-nums">
        {value > 0
          ? <span className="text-slate-800">{currencySymbol}{fmt(value)}</span>
          : <span className="text-slate-300">—</span>
        }
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-1 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Travel &amp; Hotel
        </h4>
      </div>

      {/* Column labels */}
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

      {/* ── Rows ── */}
      <div className="divide-y divide-slate-100">

        {/* Total Labour Cost — read-only, from trade breakdown */}
        <div className={ROW_GRID} style={GRID_COLS}>
          <span className="text-xs font-medium text-slate-700 leading-snug">
            Total Labour Cost
          </span>
          <div className="flex items-center justify-end">
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded tabular-nums shrink-0">
              {totalLaborCost > 0 ? `${currencySymbol}${fmt(totalLaborCost)}` : '—'}
            </span>
          </div>
          <div className="text-right text-xs text-slate-300 tabular-nums">—</div>
        </div>

        {inputRow('Labour Hourly Rate', 'hourlyRate', '$', '/hr')}

        {/* Total Labour Hours — derived */}
        {calcRow('Total Labour Hours (calculated)', derived.totalLaborHours, false, true)}

        {/* Days — derived */}
        {calcRow('Days (calculated)', derived.days, false, true)}

        {inputRow('Hours Premium', 'hoursPremium', '$', '')}
        {inputRow('Travel Per Diem', 'travelPerDiem', '$', '/day')}
        {inputRow('Hotel / Day', 'hotelPerDay', '$', '/day')}

        {/* Cost rows */}
        {costRow('Hours Premium', config.hoursPremium)}
        {costRow('Travel Cost  (Travel per diem × Days)', derived.travelCost)}
        {costRow('Hotel Cost  (Hotel/day × Days)', derived.hotelCost)}
      </div>

      {/* Subtotal */}
      <div
        className={`${ROW_GRID} border-t-2 border-slate-200 mt-0.5`}
        style={GRID_COLS}
      >
        <span className="text-xs font-bold text-slate-600 col-span-2">
          Travel &amp; Hotel Subtotal
        </span>
        <span className="text-xs font-bold text-slate-800 tabular-nums text-right">
          {currencySymbol}{fmt(derived.total)}
        </span>
      </div>
    </div>
  );
}

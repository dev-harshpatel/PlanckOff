'use client';

import React, { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';

import { NumberInput } from '@/components/ui';
import { calcInflation } from './formulas';
import type {
  ConstructionInflationYear,
  InflationConfig,
  PreconstructionInflationYear,
} from './types';

interface InflationSectionProps {
  config: InflationConfig;
  totalLaborCost: number;
  totalMaterialCost: number;
  onChange: (config: InflationConfig) => void;
  currencySymbol?: string;
}

const INPUT_CLS =
  'text-center text-xs border border-slate-200 rounded px-1 py-1 ' +
  'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white tabular-nums';

export function InflationSection({
  config,
  totalLaborCost,
  totalMaterialCost,
  onChange,
  currencySymbol = '$',
}: InflationSectionProps) {
  const fmt = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  const result = calcInflation(config, totalLaborCost, totalMaterialCost);
  const yearsToStart = Math.max(0, config.startYear - config.currentYear);
  const syncPreconstructionYears = useMemo(
    () => {
      const minRows = Math.max(1, yearsToStart);
      return Array.from({ length: Math.max(minRows, config.preconstructionYears.length) }, (_, index) => {
        const existing = config.preconstructionYears[index];
        return existing ?? {
          id: `pre-${index + 1}`,
          yearIndex: index + 1,
          laborInflationPercent: 0,
          materialInflationPercent: 0,
        };
      });
    },
    [config.preconstructionYears, yearsToStart],
  );

  const setBaseField = useCallback(
    (field: 'currentYear' | 'startYear', value: number) => {
      onChange({ ...config, [field]: value });
    },
    [config, onChange],
  );

  const updatePreconstructionYear = useCallback(
    (id: string, field: keyof PreconstructionInflationYear, value: number) => {
      onChange({
        ...config,
        preconstructionYears: syncPreconstructionYears.map((row) =>
          row.id === id ? { ...row, [field]: value } : row,
        ),
      });
    },
    [config, onChange, syncPreconstructionYears],
  );

  const addPreconstructionYear = useCallback(() => {
    const nextIndex = syncPreconstructionYears.length + 1;
    onChange({
      ...config,
      preconstructionYears: [
        ...syncPreconstructionYears,
        {
          id: `pre-${nextIndex}`,
          yearIndex: nextIndex,
          laborInflationPercent: 0,
          materialInflationPercent: 0,
        },
      ],
    });
  }, [config, onChange, syncPreconstructionYears]);

  const removePreconstructionYear = useCallback((id: string) => {
    const remaining = syncPreconstructionYears.filter((row) => row.id !== id);
    onChange({
      ...config,
      preconstructionYears: remaining.length > 0 ? remaining : syncPreconstructionYears,
    });
  }, [config, onChange, syncPreconstructionYears]);

  const updateConstructionYear = useCallback(
    (id: string, field: keyof ConstructionInflationYear, value: number) => {
      onChange({
        ...config,
        constructionYears: config.constructionYears.map((row) =>
          row.id === id ? { ...row, [field]: value } : row,
        ),
      });
    },
    [config, onChange],
  );

  const addConstructionYear = useCallback(() => {
    const nextIndex = config.constructionYears.length + 1;
    onChange({
      ...config,
      constructionYears: [
        ...config.constructionYears,
        {
          id: `con-${nextIndex}`,
          yearIndex: nextIndex,
          laborCompletionPercent: 0,
          materialCompletionPercent: 0,
          laborInflationPercent: 0,
          materialInflationPercent: 0,
        },
      ],
    });
  }, [config, onChange]);

  const removeConstructionYear = useCallback((id: string) => {
    const remaining = config.constructionYears.filter((row) => row.id !== id);
    onChange({
      ...config,
      constructionYears: remaining.length > 0 ? remaining : config.constructionYears,
    });
  }, [config, onChange]);

  const ROW_GRID = 'grid items-center gap-x-4 py-2.5 px-3 hover:bg-slate-50 transition-colors';
  const GRID_COLS = { gridTemplateColumns: '160px 1fr 110px 110px 32px' };
  const SMALL = 'w-16';

  const n = (
    value: number,
    onValueChange: (value: number) => void,
    placeholder: string,
    isFloat = true,
    width = SMALL,
  ) => (
    <NumberInput
      cellMode
      type={isFloat ? 'float' : 'int'}
      value={value}
      onChange={(v) => onValueChange(v ?? 0)}
      className={`${width} ${INPUT_CLS}`}
      placeholder={placeholder}
    />
  );

  const sectionHeader = (title: string) => (
    <div className="px-3 py-2 border-b border-slate-200 bg-white">
      <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
        {title}
      </h5>
    </div>
  );

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1 border-b border-slate-200 pb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Inflation
        </h4>
      </div>

      <div className={ROW_GRID} style={GRID_COLS}>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Year
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Inputs
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">
          Labour
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">
          Material
        </span>
        <span />
      </div>

      <div className="bg-slate-50/70 border border-slate-200 rounded-lg overflow-hidden">
        {sectionHeader('1. Preconstruction Inflation')}

        {syncPreconstructionYears.map((row, index) => {
          const rowResult = result.preconstructionYears[index] ?? {
            labor: 0,
            material: 0,
          };

          return (
            <div key={row.id} className={ROW_GRID} style={GRID_COLS}>
              <span className="text-xs font-medium text-slate-700">
                Year {index + 1} Inflation
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {index === 0 && (
                  <>
                    <span className="text-[10px] text-slate-500">Current Year</span>
                    {n(config.currentYear, (value) => setBaseField('currentYear', value), '2026', false)}
                    <span className="text-[10px] text-slate-500">Start Year</span>
                    {n(config.startYear, (value) => setBaseField('startYear', value), '2026', false)}
                    <span className="text-[10px] text-slate-400">|</span>
                  </>
                )}
                <span className="text-[10px] text-slate-500">Lab %</span>
                {n(row.laborInflationPercent, (value) => updatePreconstructionYear(row.id, 'laborInflationPercent', value), '0')}
                <span className="text-[10px] text-slate-500">Mat %</span>
                {n(row.materialInflationPercent, (value) => updatePreconstructionYear(row.id, 'materialInflationPercent', value), '0')}
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                {rowResult.labor > 0 ? `${currencySymbol}${fmt(rowResult.labor)}` : <span className="text-slate-300">—</span>}
              </span>
              <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                {rowResult.material > 0 ? `${currencySymbol}${fmt(rowResult.material)}` : <span className="text-slate-300">—</span>}
              </span>
              <button
                type="button"
                onClick={() => removePreconstructionYear(row.id)}
                className={syncPreconstructionYears.length > 1 ? 'text-slate-300 hover:text-red-500 p-1' : 'invisible p-1'}
                aria-label={syncPreconstructionYears.length > 1 ? 'Remove preconstruction year' : undefined}
              >
                &times;
              </button>
            </div>
          );
        })}

        <div className="px-3 pb-3">
          <p className="mb-2 text-[10px] text-slate-400">
            Formula: Total Project Cost x (1 + Inflation %) ^ (Start Year - Current Year)
          </p>
          <button
            type="button"
            onClick={addPreconstructionYear}
            className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium hover:underline"
          >
            <Plus size={12} />
            Add Preconstruction Year
          </button>
        </div>
      </div>

      <div className="bg-slate-50/70 border border-slate-200 rounded-lg overflow-hidden mt-3">
        {sectionHeader('2. During Construction Inflation')}

        {config.constructionYears.map((row, index) => {
          const rowResult = result.constructionYears[index] ?? {
            labor: 0,
            material: 0,
          };

          return (
            <div key={row.id} className={ROW_GRID} style={GRID_COLS}>
              <span className="text-xs font-medium text-slate-700">
                Year {index + 1} Inflation
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-slate-500">Lab % Complete</span>
                {n(row.laborCompletionPercent, (value) => updateConstructionYear(row.id, 'laborCompletionPercent', value), '0')}
                <span className="text-[10px] text-slate-500">Lab % Infl.</span>
                {n(row.laborInflationPercent, (value) => updateConstructionYear(row.id, 'laborInflationPercent', value), '0')}
                <span className="text-[10px] text-slate-500">Mat % Complete</span>
                {n(row.materialCompletionPercent, (value) => updateConstructionYear(row.id, 'materialCompletionPercent', value), '0')}
                <span className="text-[10px] text-slate-500">Mat % Infl.</span>
                {n(row.materialInflationPercent, (value) => updateConstructionYear(row.id, 'materialInflationPercent', value), '0')}
              </div>
              <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                {rowResult.labor > 0 ? `${currencySymbol}${fmt(rowResult.labor)}` : <span className="text-slate-300">—</span>}
              </span>
              <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                {rowResult.material > 0 ? `${currencySymbol}${fmt(rowResult.material)}` : <span className="text-slate-300">—</span>}
              </span>
              <button
                type="button"
                onClick={() => removeConstructionYear(row.id)}
                className={config.constructionYears.length > 1 ? 'text-slate-300 hover:text-red-500 p-1' : 'invisible p-1'}
                aria-label={config.constructionYears.length > 1 ? 'Remove construction year' : undefined}
              >
                &times;
              </button>
            </div>
          );
        })}

        <div className="px-3 pb-3">
          <p className="mb-2 text-[10px] text-slate-400">
            Formula: Preconstruction Inflation + (Base Cost x % complete x Inflation %)
          </p>
          <button
            type="button"
            onClick={addConstructionYear}
            className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium hover:underline"
          >
            <Plus size={12} />
            Add Construction Year
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[1fr,110px,110px] gap-x-4 border-t-2 border-slate-200 pt-2 px-2">
        <span className="text-xs font-bold text-slate-600">
          Inflation Subtotal
        </span>
        <span className="text-right text-xs font-bold text-slate-800 tabular-nums">
          {currencySymbol}{fmt(result.preconstructionLabor + result.duringConstructionLabor)}
        </span>
        <span className="text-right text-xs font-bold text-slate-800 tabular-nums">
          {currencySymbol}{fmt(result.preconstructionMaterial + result.duringConstructionMaterial)}
        </span>
      </div>

      <div className="mt-1 flex justify-end px-2">
        <span className="text-xs font-bold text-slate-800 tabular-nums">
          Total: {currencySymbol}{fmt(result.total)}
        </span>
      </div>
    </div>
  );
}

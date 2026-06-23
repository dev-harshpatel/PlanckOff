'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CalculatedMaterial } from '@/types';
import { Check, Download, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ExportModal } from '@/components/features/reports/ExportModal';
import type { ExportColumnDef, ExportRow } from '@/lib/utils/exportUtils';
import {
  MaterialsFilterDropdown,
  MaterialsFilterState,
} from '@/components/features/reports/MaterialsFilterDropdown';
import { useReportFilters } from '@/hooks/useReportFilters';
import { useProjectDataContext } from '@/context/ProjectDataContext';
import { aggregateMaterialsFromCosting } from '@/lib/utils/aggregateMaterialsFromCosting';

import { pruneSelectedFilterValues } from '@/lib/utils/reportFilterState';
import type { MaterialCosting } from "@/types/assembly";

interface MaterialsViewProps {
  items: ExtendedLineItem[];
  materialCostingData?: MaterialCosting[];
  filterStorageKey?: string;
  onUnitCostChange?: (code: string, newCost: number, unit: string) => void;
}

export interface ExtendedLineItem extends CalculatedMaterial {
  area: string; // Level/Floor
  costCode: string;
  section: string;
  conditionType: string; // Assembly Name
  supplier?: string;
  secQuantity?: number;
  secUnit?: string;
  assemblyType?: string; // Interior Walls, Exterior Walls, Ceiling, BulkHead, etc.
}

interface AggregatedItem {
  code: string;
  item: string;
  section: string;
  costCode: string;
  quantity: number;
  unit: string;
  secQuantity: number | null;
  secUnit: string | null;
  wastePercent: number;
  unitCost: number;
  totalCost: number;
}

interface MaterialContribution extends AggregatedItem {
  levels: string[];
}

const formatCurrency = (val: number) =>
  val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Splits comma-separated level strings into individual levels */
const parseLevels = (levelStr: string): string[] => {
  if (!levelStr || levelStr === 'Unknown') return [];
  return levelStr
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
};

/** Sorts levels naturally (Level 1, Level 2, ... Level 10) */
const sortLevels = (levels: string[]): string[] =>
  [...levels].sort((a, b) => {
    const nA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return nA - nB;
  });

/** Unit cost can be small (e.g. 0.0185/SF) — show up to 4 decimals to avoid rounding to 0.02 */
const formatUnitCost = (val: number) =>
  val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const TableHeader = () => (
  <tr>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200">Item Code</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200">Description</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-right">Qty</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-center">UOM</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-right">Sec. Qty</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-center">Sec. UOM</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-right">Unit Cost</th>
    <th className="sticky top-0 z-10 bg-slate-100 p-3 border-b border-slate-200 text-right">Total Cost</th>
  </tr>
);

export const MaterialsView = ({
  items,
  materialCostingData = [],
  filterStorageKey = 'project-report:materials',
  onUnitCostChange,
}: MaterialsViewProps) => {
  const createDefaultFilterState = useCallback((): MaterialsFilterState => ({
    selectedItems: new Set(),
    selectedLevels: new Set(),
    selectedSections: new Set(),
    selectedCostCodes: new Set(),
  }), []);
  const [filterState, setFilterState] = useReportFilters<MaterialsFilterState>(
    filterStorageKey,
    createDefaultFilterState,
  );
  const { projectCosts } = useProjectDataContext();

  // Local overrides take priority over aggregated unit costs (handles spec_database priority issue)
  const [unitCostOverrides, setUnitCostOverrides] = useState<Record<string, number>>({});
  // Track codes explicitly saved this session — only these get the ✓ indicator
  const [editedCodes, setEditedCodes] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [originalValue, setOriginalValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleUnitCostClick = useCallback((code: string, currentCost: number) => {
    if (!onUnitCostChange) return;
    const strVal = String(currentCost);
    setEditingCode(code);
    setEditingValue(strVal);
    setOriginalValue(strVal);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, [onUnitCostChange]);

  const cancelEdit = useCallback(() => {
    setEditingCode(null);
    setEditingValue('');
    setOriginalValue('');
  }, []);

  const commitUnitCostEdit = useCallback((code: string, unit: string) => {
    const parsed = parseFloat(editingValue);
    if (!isNaN(parsed) && parsed >= 0 && editingValue !== originalValue) {
      setUnitCostOverrides((prev) => ({ ...prev, [code]: parsed }));
      setEditedCodes((prev) => new Set(prev).add(code));
      onUnitCostChange?.(code, parsed, unit);
    }
    setEditingCode(null);
    setEditingValue('');
    setOriginalValue('');
  }, [editingValue, originalValue, onUnitCostChange]);

  // Prefer pipeline output (materialCostingData) when available — it has the correct quantities and units.
  // Fall back to items (calculateMaterials) only when no pipeline data exists.
  const useCostingData = materialCostingData.length > 0;

  const costingBaseData = useMemo(() => {
    if (!useCostingData) return null;

    const contributions: MaterialContribution[] = [];
    const availableItems = new Set<string>();
    const availableLevels = new Set<string>();
    const availableSections = new Set<string>();
    const availableCostCodes = new Set<string>();

    materialCostingData.forEach((assembly) => {
      const levelStr = (assembly as { level?: string }).level ?? 'Unknown';
      const levels = parseLevels(levelStr).filter((level) => level && level !== 'Unknown');
      const assemblyLevels = levels.length > 0 ? levels : ['Unknown'];
      const rows = aggregateMaterialsFromCosting([assembly]);

      rows.forEach((row) => {
        contributions.push({
          code: row.code,
          item: row.item,
          section: row.section,
          costCode: row.matCostCode,
          quantity: row.quantity,
          unit: row.unit,
          secQuantity: row.secQuantity,
          secUnit: row.secUnit,
          wastePercent: row.wastePercent,
          unitCost: row.unitCost,
          totalCost: row.totalCost,
          levels: assemblyLevels,
        });
        availableItems.add(row.item);
        if (row.section) availableSections.add(row.section);
        if (row.matCostCode) availableCostCodes.add(row.matCostCode);
      });

      levels.forEach((level) => availableLevels.add(level));
    });

    return {
      contributions,
      availableItems: Array.from(availableItems).sort(),
      availableLevels: sortLevels(Array.from(availableLevels)),
      availableSections: Array.from(availableSections).sort(),
      availableCostCodes: Array.from(availableCostCodes).sort(),
    };
  }, [materialCostingData, useCostingData]);

  const fallbackBaseData = useMemo(() => ({
    contributions: items,
    availableItems: Array.from(new Set(items.map((item) => item.item).filter(Boolean))).sort(),
    availableLevels: Array.from(new Set(items.map((item) => String(item.area ?? 'Unknown'))))
      .filter((level) => level !== 'Unknown')
      .sort(),
    availableSections: Array.from(new Set(items.map((item) => item.section).filter(Boolean))).sort(),
    availableCostCodes: Array.from(new Set(items.map((item) => item.costCode).filter(Boolean))).sort(),
  }), [items]);

  const { aggregatedItems, totalCost, availableItems, availableLevels, availableSections, availableCostCodes } =
    useMemo(() => {
      if (useCostingData && costingBaseData) {
        let filtered = costingBaseData.contributions;
        if (filterState.selectedLevels.size > 0) {
          filtered = filtered.filter((row) =>
            row.levels.some((level) => filterState.selectedLevels.has(level)),
          );
        }
        if (filterState.selectedItems.size > 0) {
          filtered = filtered.filter((r) =>
            filterState.selectedItems.has(r.item)
          );
        }
        if (filterState.selectedSections.size > 0) {
          filtered = filtered.filter((r) =>
            filterState.selectedSections.has(r.section)
          );
        }
        if (filterState.selectedCostCodes.size > 0) {
          filtered = filtered.filter((r) =>
            filterState.selectedCostCodes.has(r.costCode)
          );
        }

        const aggMap = new Map<
          string,
          AggregatedItem & { levels: Set<string> }
        >();

        filtered.forEach((row) => {
          const key = `${row.code}|${row.item}|${row.unit}|${row.section}`;
          if (aggMap.has(key)) {
            const existing = aggMap.get(key)!;
            existing.quantity += row.quantity;
            existing.totalCost += row.totalCost;
            if (row.secQuantity != null) {
              existing.secQuantity = (existing.secQuantity ?? 0) + row.secQuantity;
              existing.secUnit = row.secUnit ?? existing.secUnit;
            }
            row.levels.forEach((level) => existing.levels.add(level));
          } else {
            aggMap.set(key, {
              ...row,
              secQuantity: row.secQuantity ?? null,
              secUnit: row.secUnit ?? null,
              levels: new Set(row.levels),
            });
          }
        });

        const aggregatedRows = Array.from(aggMap.values()).map(({ levels: _levels, ...row }) => row);
        const total = aggregatedRows.reduce((acc, row) => acc + row.totalCost, 0);
        return {
          aggregatedItems: aggregatedRows,
          totalCost: total,
          availableItems: costingBaseData.availableItems,
          availableLevels: costingBaseData.availableLevels,
          availableSections: costingBaseData.availableSections,
          availableCostCodes: costingBaseData.availableCostCodes,
        };
      }

      let filtered = fallbackBaseData.contributions;
      if (filterState.selectedLevels.size > 0) {
        filtered = filtered.filter((i) =>
          filterState.selectedLevels.has(i.area)
        );
      }
      if (filterState.selectedItems.size > 0) {
        filtered = filtered.filter((i) =>
          filterState.selectedItems.has(i.item)
        );
      }
      if (filterState.selectedSections.size > 0) {
        filtered = filtered.filter((i) =>
          filterState.selectedSections.has(i.section)
        );
      }
      if (filterState.selectedCostCodes.size > 0) {
        filtered = filtered.filter((i) =>
          filterState.selectedCostCodes.has(i.costCode)
        );
      }

      const aggMap = new Map<
        string,
        {
          code: string;
          item: string;
          section: string;
          costCode: string;
          quantity: number;
          unit: string;
          secQuantity: number | null;
          secUnit: string | null;
          wastePercent: number;
          overridePrice?: number;
        }
      >();

      filtered.forEach((item) => {
        const key = `${item.item}|${item.unit}|${item.code ?? ''}|${item.section}`;
        const overridePrice = (item as { overridePrice?: number }).overridePrice;
        if (aggMap.has(key)) {
          const existing = aggMap.get(key)!;
          existing.quantity += item.quantity;
          if (item.secQuantity != null) {
            existing.secQuantity =
              (existing.secQuantity ?? 0) + item.secQuantity;
            existing.secUnit = item.secUnit ?? existing.secUnit;
          }
          if (overridePrice != null && existing.overridePrice == null) {
            existing.overridePrice = overridePrice;
          }
        } else {
          aggMap.set(key, {
            code: item.code ?? '—',
            item: item.item,
            section: item.section,
            costCode: item.costCode,
            quantity: item.quantity,
            unit: item.unit,
            secQuantity: item.secQuantity ?? null,
            secUnit: item.secUnit ?? null,
            wastePercent: item.wastePercent ?? 0,
            overridePrice,
          });
        }
      });

      const aggItems: AggregatedItem[] = Array.from(aggMap.entries()).map(
        ([, v]) => {
          const unitCost = v.overridePrice ?? 0;
          const totalCost = v.quantity * unitCost;
          return { ...v, unitCost, totalCost };
        }
      );

      const total = aggItems.reduce((acc, i) => acc + i.totalCost, 0);
      return {
        aggregatedItems: aggItems,
        totalCost: total,
        availableItems: fallbackBaseData.availableItems,
        availableLevels: fallbackBaseData.availableLevels,
        availableSections: fallbackBaseData.availableSections,
        availableCostCodes: fallbackBaseData.availableCostCodes,
      };
    }, [
      costingBaseData,
      fallbackBaseData,
      filterState,
      useCostingData,
    ]);

  const handleFilterChange = useCallback((state: MaterialsFilterState) => {
    setFilterState(state);
  }, []);

  React.useEffect(() => {
    setFilterState((prev) => {
      const nextState: MaterialsFilterState = {
        selectedItems: pruneSelectedFilterValues(prev.selectedItems, availableItems),
        selectedLevels: pruneSelectedFilterValues(prev.selectedLevels, availableLevels),
        selectedSections: pruneSelectedFilterValues(prev.selectedSections, availableSections),
        selectedCostCodes: pruneSelectedFilterValues(prev.selectedCostCodes, availableCostCodes),
      };

      const unchanged =
        nextState.selectedItems === prev.selectedItems &&
        nextState.selectedLevels === prev.selectedLevels &&
        nextState.selectedSections === prev.selectedSections &&
        nextState.selectedCostCodes === prev.selectedCostCodes;

      return unchanged ? prev : nextState;
    });
  }, [availableCostCodes, availableItems, availableLevels, availableSections, setFilterState]);

  // Apply local unit cost overrides — takes priority over aggregated values
  const displayItems = useMemo(
    () =>
      aggregatedItems.map((r) => {
        const override = unitCostOverrides[r.code];
        if (override == null) return r;
        return { ...r, unitCost: override, totalCost: r.quantity * override };
      }),
    [aggregatedItems, unitCostOverrides],
  );

  const displayTotalCost = useMemo(
    () => displayItems.reduce((acc, r) => acc + r.totalCost, 0),
    [displayItems],
  );

  const [showExport, setShowExport] = useState(false);

  const MATERIALS_COLUMNS: ExportColumnDef[] = [
    { key: 'code',        label: 'Item Code',   defaultEnabled: true,  format: 'string' },
    { key: 'item',        label: 'Description', defaultEnabled: true,  format: 'string' },
    { key: 'quantity',    label: 'Qty',         defaultEnabled: true,  format: 'number',   align: 'right' },
    { key: 'unit',        label: 'UOM',         defaultEnabled: true,  format: 'string',   align: 'center' },
    { key: 'secQuantity', label: 'Sec. Qty',    defaultEnabled: true,  format: 'number',   align: 'right' },
    { key: 'secUnit',     label: 'Sec. UOM',    defaultEnabled: true,  format: 'string',   align: 'center' },
    { key: 'unitCost',    label: 'Unit Cost',   defaultEnabled: true,  format: 'currency', align: 'right' },
    { key: 'totalCost',   label: 'Total Cost',  defaultEnabled: true,  format: 'currency', align: 'right' },
  ];

  const exportRows = useMemo<ExportRow[]>(
    () =>
      displayItems.map((r) => ({
        code:        r.code,
        item:        r.item,
        quantity:    r.quantity,
        unit:        r.unit,
        secQuantity: r.secQuantity ?? null,
        secUnit:     r.secUnit ?? null,
        unitCost:    r.unitCost,
        totalCost:   r.totalCost,
      })),
    [displayItems]
  );
  const summaryRows = useMemo<ExportRow[]>(
    () => [
      {
        item: 'Total',
        totalCost: displayTotalCost,
      },
    ],
    [displayTotalCost],
  );

  const filtersActive =
    filterState.selectedItems.size > 0 ||
    filterState.selectedLevels.size > 0 ||
    filterState.selectedSections.size > 0 ||
    filterState.selectedCostCodes.size > 0;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <MaterialsFilterDropdown
            availableItems={availableItems}
            availableLevels={availableLevels}
            availableSections={availableSections}
            availableCostCodes={availableCostCodes}
            filterState={filterState}
            onFilterChange={handleFilterChange}
          />
          <div className="text-sm font-bold text-slate-700">
            Total Material: ${formatCurrency(projectCosts.totalMaterial)}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Download}
          onClick={() => setShowExport(true)}
        >
          Export
        </Button>
      </div>

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        filename="materials-export"
        sheetName="Materials"
        columns={MATERIALS_COLUMNS}
        rows={exportRows}
        summaryRows={summaryRows}
        filtersActive={filtersActive}
      />

      {/* Flat materials table */}
      <div className="flex-1 overflow-hidden">
        {displayItems.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm bg-white m-4 rounded-lg border border-slate-200">
            No materials match the selected filters.
          </div>
        ) : (
          <div className="h-[calc(100%-2rem)] overflow-auto bg-white m-4 rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600 font-semibold">
                <TableHeader />
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayItems.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-2 pl-3 font-mono text-slate-500">
                      {row.code}
                    </td>
                    <td className="p-2 font-medium text-slate-800">
                      {row.item}
                    </td>
                    <td className="p-2 text-right font-medium">
                      {row.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </td>
                    <td className="p-2 text-center text-slate-500">
                      {row.unit}
                    </td>
                    <td className="p-2 text-right text-slate-600">
                      {row.secQuantity != null
                        ? row.secQuantity.toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })
                        : '—'}
                    </td>
                    <td className="p-2 text-center text-slate-500">
                      {row.secUnit ?? '—'}
                    </td>
                    <td
                      className={`p-2 text-right text-slate-600 ${onUnitCostChange && editingCode !== row.code ? 'cursor-pointer hover:bg-emerald-50 group' : ''}`}
                      onClick={() => onUnitCostChange && editingCode !== row.code && handleUnitCostClick(row.code, row.unitCost)}
                      title={onUnitCostChange && editingCode !== row.code ? 'Click to edit unit cost' : undefined}
                    >
                      {editingCode === row.code ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            ref={editInputRef}
                            type="number"
                            min={0}
                            step="any"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingValue !== originalValue) commitUnitCostEdit(row.code, row.unit);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="w-16 text-right text-xs border border-emerald-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {editingValue !== originalValue && (
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitUnitCostEdit(row.code, row.unit); }}
                              className="p-0.5 rounded text-emerald-600 hover:bg-emerald-100"
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                          )}
                          <button
                            onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
                            className="p-0.5 rounded text-slate-400 hover:bg-slate-100"
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className={onUnitCostChange ? 'group-hover:text-emerald-700 transition-colors' : ''}>
                          ${formatUnitCost(row.unitCost)}
                          {editedCodes.has(row.code) && (
                            <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-800">
                      ${formatCurrency(row.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

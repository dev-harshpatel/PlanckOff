'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ExportModal } from '@/components/features/reports/ExportModal';
import type { ExportColumnDef, ExportRow } from '@/lib/utils/exportUtils';
import { LaborFormulaModal } from '@/components/features/reports/LaborFormulaModal';
import {
  LaborFilterDropdown,
  LaborFilterState,
} from '@/components/features/reports/LaborFilterDropdown';
import { useReportFilters } from '@/hooks/useReportFilters';
import { useProjectDataContext } from '@/context/ProjectDataContext';
import { pruneSelectedFilterValues } from '@/lib/utils/reportFilterState';
import type { ExtendedLineItem } from '@/components/features/reports/MaterialsView';
import type {
  MaterialCosting,
  MatchedLabor,
} from "@/types/assembly";
import type { MaterialDefinition } from "@/types";

const LOG_LABOR_QTY_VERIFICATION = process.env.NEXT_PUBLIC_LOG_LABOR_QTY === 'true';

interface LaborViewProps {
  items: ExtendedLineItem[];
  materialCostingData?: MaterialCosting[];
  priceMap: Record<string, { cost: number; per: number }>;
  materials?: MaterialDefinition[];
  filterStorageKey?: string;
  onUnitCostChange?: (code: string, newCost: number) => void;
}

interface AggregatedLaborItem {
  rowKey: string;
  itemCode: string;
  costCode: string;
  item: string;
  conditionType: string;
  quantity: number | null;
  unit: string;
  secQuantity: number | null;
  secUnit: string | null;
  unitCost: number;
  totalCost: number | null;
  areas: string[];
  dimensions: { totalLength: number; heightFt: number; ceilingArea: number };
}

interface LaborContribution {
  rowKey: string;
  itemCode: string;
  costCode: string;
  item: string;
  conditionType: string;
  quantity: number | null;
  secQuantity: number | null;
  unit: string;
  secUnit: string | null;
  unitCost: number;
  areas: string[];
  dimensions: { totalLength: number; heightFt: number; ceilingArea: number };
}

const formatCurrency = (val: number) =>
  val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Splits comma-separated level strings into individual levels (e.g. "Level 3, Level 4, Level 5" → ["Level 3", "Level 4", "Level 5"]) */
const parseLevels = (levelStr: string): string[] => {
  if (!levelStr || levelStr === 'Unknown') return [];
  return levelStr
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
};

/** Sorts levels naturally (Level 1, Level 2, ... Level 10, Level 11) */
const sortLevels = (levels: string[]): string[] =>
  [...levels].sort((a, b) => {
    const nA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return nA - nB;
  });


const TableHeader = ({
  showConditionName,
  showArea,
}: {
  showConditionName: boolean;
  showArea: boolean;
}) => (
  <tr>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600">Item Code</th>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600">Description</th>
    {showConditionName && (
      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600">Condition Name</th>
    )}
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-right">Quantity / Hrs</th>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-center">UOM</th>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-center">Wage Type</th>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-right">Rate</th>
    <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-right">Total Cost</th>
    {showArea && (
      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 text-right">Area</th>
    )}
  </tr>
);

export const LaborView = ({
  items,
  materialCostingData = [],
  priceMap,
  materials = [],
  filterStorageKey = 'project-report:labor',
  onUnitCostChange,
}: LaborViewProps) => {
  const createDefaultFilterState = useCallback((): LaborFilterState => ({
    selectedItems: new Set(),
    selectedLevels: new Set(),
    selectedCostCodes: new Set(),
    selectedConditions: new Set(),
  }), []);
  const [filterState, setFilterState] = useReportFilters<LaborFilterState>(
    filterStorageKey,
    createDefaultFilterState,
  );
  const { projectCosts } = useProjectDataContext();

  const [qtyOverrides, setQtyOverrides] = useState<Record<string, { qty: number | null; secQty: number | null }>>({});

  // Local unit cost overrides for labor
  const [unitCostOverrides, setUnitCostOverrides] = useState<Record<string, number>>({});
  // Track codes explicitly saved this session — only these get the ✓ indicator
  const [editedCodes, setEditedCodes] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [originalValue, setOriginalValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleUnitCostClick = useCallback((rowKey: string, currentCost: number) => {
    if (!onUnitCostChange) return;
    const strVal = String(currentCost);
    setEditingCode(rowKey);
    setEditingValue(strVal);
    setOriginalValue(strVal);
    setTimeout(() => editInputRef.current?.select(), 0);
  }, [onUnitCostChange]);

  const cancelEdit = useCallback(() => {
    setEditingCode(null);
    setEditingValue('');
    setOriginalValue('');
  }, []);

  const commitUnitCostEdit = useCallback((rowKey: string, itemCode: string) => {
    const parsed = parseFloat(editingValue);
    if (!isNaN(parsed) && parsed >= 0 && editingValue !== originalValue) {
      setUnitCostOverrides((prev) => ({ ...prev, [rowKey]: parsed }));
      setEditedCodes((prev) => new Set(prev).add(rowKey));
      onUnitCostChange?.(itemCode, parsed);
    }
    setEditingCode(null);
    setEditingValue('');
    setOriginalValue('');
  }, [editingValue, originalValue, onUnitCostChange]);
  const [formulaModal, setFormulaModal] = useState<{
    isOpen: boolean;
    row: AggregatedLaborItem | null;
    openedFrom: 'qty' | 'seqty';
  }>({ isOpen: false, row: null, openedFrom: 'qty' });

  // Prefer pipeline output (materialCostingData) when available — it has the correct SF/LF units and quantities.
  // Fall back to items (calculateMaterials) only when no pipeline data exists.
  const useCostingData = materialCostingData.length > 0;
  const LOG_TARGETS = [
    'Hang Drywall (Walls < 12ft)',
    'Install Metal Studs (Walls < 12ft)',
  ] as const;
  const matCostCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((m) => { if (m.code) map.set(m.code, m.matCostCode ?? ''); });
    return map;
  }, [materials]);

  const costingBaseData = useMemo(() => {
    if (!useCostingData) return null;

    const contributions: LaborContribution[] = [];
    const availableItems = new Set<string>();
    const availableLevels = new Set<string>();
    const availableCostCodes = new Set<string>();

    materialCostingData.forEach((assembly) => {
      const extAssembly = assembly as {
        assembly_id?: string;
        level?: string;
        height_ft?: number;
        total_length?: number;
      };
      const assemblyId = extAssembly.assembly_id ?? '—';
      const parsedLevels = parseLevels(extAssembly.level ?? 'Unknown');
      const areas = parsedLevels.length > 0 ? parsedLevels : ['Unknown'];
      const conditionType =
        typeof extAssembly.height_ft === 'number' && typeof extAssembly.total_length === 'number'
          ? `Assembly ${assemblyId} (${extAssembly.height_ft}' : ${extAssembly.total_length} LF)`
          : `Assembly ${assemblyId}`;

      parsedLevels.forEach((level) => availableLevels.add(level));

      (assembly.materials_costing ?? []).forEach((costingItem) => {
        const ext = costingItem.extracted_material as { total_length?: number; height_ft?: number; ceiling_area?: number } | null;
        (costingItem.matched_labor ?? []).forEach((lab: MatchedLabor) => {
          const costCode = matCostCodeMap.get(lab.code) ?? '';
          contributions.push({
            rowKey: `${lab.code}|${lab.description}|${lab.unit}|${assemblyId}|${areas.join(',')}`,
            itemCode: lab.code,
            costCode,
            item: lab.description,
            conditionType,
            quantity: lab.quantity != null && typeof lab.quantity === 'number' ? lab.quantity : null,
            secQuantity: lab.sec_quantity != null && typeof lab.sec_quantity === 'number' ? lab.sec_quantity : null,
            unit: lab.unit === 'EA' ? 'Hrs' : lab.unit,
            secUnit: lab.sec_unit ?? null,
            unitCost: lab.unit_cost,
            areas,
            dimensions: {
              totalLength: ext?.total_length ?? 0,
              heightFt: ext?.height_ft ?? 0,
              ceilingArea: ext?.ceiling_area ?? 0,
            },
          });
          availableItems.add(lab.description);
          if (costCode) availableCostCodes.add(costCode);
        });
      });
    });

    return {
      contributions,
      availableItems: Array.from(availableItems).sort(),
      availableLevels: sortLevels(Array.from(availableLevels)),
      availableCostCodes: Array.from(availableCostCodes).sort(),
    };
  }, [matCostCodeMap, materialCostingData, useCostingData]);

  const fallbackBaseData = useMemo(() => ({
    contributions: items.map((item) => {
      const price = priceMap[item.item] || { cost: 0, per: 1 };
      const parsedLevels = parseLevels(item.area ?? 'Unknown');
      return {
        rowKey: `${item.item}|${item.unit}|${item.code ?? ''}|${item.area ?? 'Unknown'}`,
        itemCode: item.costCode ?? item.laborCode ?? '—',
        costCode: item.costCode ?? item.laborCode ?? '—',
        item: item.item,
        conditionType: item.conditionType ?? '—',
        quantity: item.quantity ?? null,
        secQuantity: null,
        unit: item.unit === 'EA' ? 'Hrs' : item.unit,
        secUnit: null,
        unitCost: price.per ? price.cost / price.per : price.cost,
        areas: parsedLevels.length > 0 ? parsedLevels : ['Unknown'],
        dimensions: { totalLength: 0, heightFt: 0, ceilingArea: 0 },
      } satisfies LaborContribution;
    }),
    availableItems: Array.from(new Set(items.map((item) => item.item).filter(Boolean))).sort(),
    availableLevels: sortLevels(
      Array.from(
        new Set(items.flatMap((item) => parseLevels(item.area ?? 'Unknown')))
      ).filter((level) => level && level !== 'Unknown')
    ),
    availableCostCodes: Array.from(new Set(items.map((item) => item.costCode).filter(Boolean))).sort(),
  }), [items, priceMap]);

  const { aggregatedItems, totalCost, availableLevels, availableItems, availableCostCodes } = useMemo(() => {
    const source = useCostingData && costingBaseData ? costingBaseData.contributions : fallbackBaseData.contributions;

    let filtered = source;
    if (filterState.selectedLevels.size > 0) {
      filtered = filtered.filter((item) => item.areas.some((area) => filterState.selectedLevels.has(area)));
    }
    if (filterState.selectedItems.size > 0) {
      filtered = filtered.filter((item) => filterState.selectedItems.has(item.item));
    }
    if (filterState.selectedCostCodes.size > 0) {
      filtered = filtered.filter((item) => filterState.selectedCostCodes.has(item.costCode));
    }

    const aggMap = new Map<
      string,
      {
        itemCode: string;
        costCode: string;
        item: string;
        conditions: Set<string>;
        quantity: number | null;
        secQuantity: number | null;
        unit: string;
        secUnit: string | null;
        areas: Set<string>;
        unitCost: number;
        dimensions: { totalLength: number; heightFt: number; ceilingArea: number };
      }
    >();

    filtered.forEach((item) => {
      const key = `${item.itemCode}|${item.item}|${item.unit}`;
      if (aggMap.has(key)) {
        const existing = aggMap.get(key)!;
        if (item.quantity != null) existing.quantity = (existing.quantity ?? 0) + item.quantity;
        if (item.secQuantity != null) existing.secQuantity = (existing.secQuantity ?? 0) + item.secQuantity;
        item.areas.forEach((area) => existing.areas.add(area));
        existing.conditions.add(item.conditionType);
      } else {
        aggMap.set(key, {
          itemCode: item.itemCode,
          costCode: item.costCode,
          item: item.item,
          conditions: new Set([item.conditionType]),
          quantity: item.quantity,
          secQuantity: item.secQuantity,
          unit: item.unit,
          secUnit: item.secUnit,
          areas: new Set(item.areas),
          unitCost: item.unitCost,
          dimensions: item.dimensions,
        });
      }
    });

    const rows: AggregatedLaborItem[] = Array.from(aggMap.entries()).map(([key, value]) => ({
      rowKey: key,
      itemCode: value.itemCode,
      costCode: value.costCode,
      item: value.item,
      conditionType: Array.from(value.conditions).sort().join(', '),
      quantity: value.quantity,
      secQuantity: value.secQuantity,
      unit: value.unit,
      secUnit: value.secUnit,
      unitCost: value.unitCost,
      totalCost: value.quantity != null ? value.quantity * value.unitCost : null,
      areas: sortLevels(Array.from(value.areas)),
      dimensions: value.dimensions,
    }));

    if (LOG_LABOR_QTY_VERIFICATION) {
      for (const target of LOG_TARGETS) {
        const targetRows = rows.filter((row) => row.item === target);
        const sumQty = targetRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
        const sumSecQty = targetRows.reduce((sum, row) => sum + (row.secQuantity ?? 0), 0);
        console.group(`[Labor] "${target}" Qty verification`);
        console.table(
          targetRows.map((row) => ({
            condition: row.conditionType,
            area: row.areas.join(', '),
            qty: row.quantity,
            secQty: row.secQuantity,
          })),
        );
        console.log('Sum Qty:', sumQty);
        console.log('Sum Sec.Qty:', sumSecQty);
        console.groupEnd();
      }
    }

    const total = rows.reduce((acc, row) => acc + (row.totalCost ?? 0), 0);
    const availableData = useCostingData && costingBaseData ? costingBaseData : fallbackBaseData;

    return {
      aggregatedItems: rows,
      totalCost: total,
      availableItems: availableData.availableItems,
      availableLevels: availableData.availableLevels,
      availableCostCodes: availableData.availableCostCodes,
    };
  }, [costingBaseData, fallbackBaseData, filterState, useCostingData]);

  const handleFilterChange = useCallback((state: LaborFilterState) => {
    setFilterState(state);
  }, []);

  React.useEffect(() => {
    setFilterState((prev) => {
      const nextState: LaborFilterState = {
        selectedItems: pruneSelectedFilterValues(prev.selectedItems, availableItems),
        selectedLevels: pruneSelectedFilterValues(prev.selectedLevels, availableLevels),
        selectedCostCodes: pruneSelectedFilterValues(prev.selectedCostCodes, availableCostCodes),
        selectedConditions: prev.selectedConditions,
      };

      const unchanged =
        nextState.selectedItems === prev.selectedItems &&
        nextState.selectedLevels === prev.selectedLevels &&
        nextState.selectedCostCodes === prev.selectedCostCodes &&
        nextState.selectedConditions === prev.selectedConditions;

      return unchanged ? prev : nextState;
    });
  }, [availableCostCodes, availableItems, availableLevels, setFilterState]);

  const handleFormulaApply = useCallback((rowKey: string, qty: number | null, secQty: number | null) => {
    setQtyOverrides((prev) => ({ ...prev, [rowKey]: { qty, secQty } }));
  }, []);

  const displayItems = useMemo(() => {
    return aggregatedItems.map((item) => {
      const qtyOverride = qtyOverrides[item.rowKey];
      const unitCost = unitCostOverrides[item.rowKey] ?? item.unitCost;
      const qty = qtyOverride?.qty ?? item.quantity;
      const secQty = qtyOverride?.secQty ?? item.secQuantity;
      return {
        ...item,
        quantity: qty,
        secQuantity: secQty,
        unitCost,
        totalCost: qty != null ? qty * unitCost : item.totalCost,
      };
    });
  }, [aggregatedItems, qtyOverrides, unitCostOverrides]);

  const displayTotal = useMemo(
    () => displayItems.reduce((acc, i) => acc + (i.totalCost ?? 0), 0),
    [displayItems],
  );

  const [showExport, setShowExport] = useState(false);

  const LABOR_COLUMNS: ExportColumnDef[] = [
    { key: 'itemCode',   label: 'Item Code',    defaultEnabled: true,  format: 'string' },
    { key: 'item',       label: 'Description',  defaultEnabled: true,  format: 'string' },
    { key: 'areas',      label: 'Level / Area', defaultEnabled: true,  format: 'string' },
    { key: 'quantity',   label: 'Qty / Hrs',    defaultEnabled: true,  format: 'number',   align: 'right' },
    { key: 'unit',       label: 'UOM',          defaultEnabled: true,  format: 'string',   align: 'center' },
    { key: 'unitCost',   label: 'Rate',         defaultEnabled: true,  format: 'currency', align: 'right' },
    { key: 'totalCost',  label: 'Total Cost',   defaultEnabled: true,  format: 'currency', align: 'right' },
  ];

  const exportRows = useMemo<ExportRow[]>(
    () =>
      displayItems.map((r) => ({
        itemCode:  r.itemCode,
        item:      r.item,
        areas:     r.areas?.join(', ') ?? '',
        quantity:  r.quantity ?? '',
        unit:      r.unit,
        unitCost:  r.unitCost,
        totalCost: r.totalCost ?? '',
      })),
    [displayItems]
  );
  const summaryRows = useMemo<ExportRow[]>(
    () => [
      {
        item: 'Total',
        totalCost: displayTotal,
      },
    ],
    [displayTotal],
  );

  const filtersActive =
    filterState.selectedItems.size > 0 ||
    filterState.selectedLevels.size > 0 ||
    filterState.selectedCostCodes.size > 0;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <LaborFilterDropdown
            availableItems={availableItems}
            availableLevels={availableLevels}
            availableCostCodes={availableCostCodes}
            filterState={filterState}
            onFilterChange={handleFilterChange}
          />
          <div className="text-sm font-bold text-slate-700">
            Total Labor: ${formatCurrency(projectCosts.totalLabor)}
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
        filename="labor-export"
        sheetName="Labor"
        columns={LABOR_COLUMNS}
        rows={exportRows}
        summaryRows={summaryRows}
        filtersActive={filtersActive}
      />

      {/* Flat labor table */}
      <div className="flex-1 overflow-hidden">
        {displayItems.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm bg-white m-4 rounded-lg border border-slate-200">
            No labor items match the selected filters.
          </div>
        ) : (
          <div className="h-[calc(100%-2rem)] overflow-auto bg-white m-4 rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm text-left table-fixed">
              <colgroup>
                <col className="w-[145px]" />
                <col />
                {filterState.selectedConditions.size > 0 && (
                  <col className="w-[220px]" />
                )}
                <col className="w-[140px]" />
                <col className="w-[70px]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col className="w-[150px]" />
                {filterState.selectedLevels.size > 0 && (
                  <col className="w-[140px]" />
                )}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600 font-semibold">
                <TableHeader
                  showConditionName={filterState.selectedConditions.size > 0}
                  showArea={filterState.selectedLevels.size > 0}
                />
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayItems.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-cyan-50/40 transition-colors`}
                  >
                    <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {row.itemCode}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 leading-snug">
                      <div className="line-clamp-2">{row.item}</div>
                    </td>
                    {filterState.selectedConditions.size > 0 && (
                      <td className="px-3 py-2.5 text-slate-600 leading-snug">
                        <div className="line-clamp-2">{row.conditionType}</div>
                      </td>
                    )}
                    {/* Qty cell */}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {row.quantity != null ? (
                        <span className="text-slate-800">
                          {row.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">
                      {row.unit}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                        Open Shop
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-slate-700 tabular-nums whitespace-nowrap ${onUnitCostChange && editingCode !== row.rowKey ? 'cursor-pointer hover:bg-emerald-50 group' : ''}`}
                      onClick={() => onUnitCostChange && editingCode !== row.rowKey && handleUnitCostClick(row.rowKey, row.unitCost)}
                      title={onUnitCostChange && editingCode !== row.rowKey ? 'Click to edit rate' : undefined}
                    >
                      {editingCode === row.rowKey ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            ref={editInputRef}
                            type="number"
                            min={0}
                            step="any"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingValue !== originalValue) commitUnitCostEdit(row.rowKey, row.itemCode);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="w-16 text-right text-xs border border-emerald-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {editingValue !== originalValue && (
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitUnitCostEdit(row.rowKey, row.itemCode); }}
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
                          ${formatCurrency(row.unitCost)}
                          {editedCodes.has(row.rowKey) && (
                            <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {row.totalCost != null ? `$${formatCurrency(row.totalCost)}` : '—'}
                    </td>
                    {filterState.selectedLevels.size > 0 && (
                      <td
                        className="px-3 py-2.5 text-right text-slate-500 min-w-0 max-w-[140px]"
                        title={row.areas
                          .filter((a) => filterState.selectedLevels.has(a))
                          .join(', ') || '—'}
                      >
                        <span className="block truncate text-right">
                          {row.areas
                            .filter((a) => filterState.selectedLevels.has(a))
                            .join(', ') || '—'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formula modal */}
      {formulaModal.row && (
        <LaborFormulaModal
          isOpen={formulaModal.isOpen}
          onClose={() => setFormulaModal((s) => ({ ...s, isOpen: false }))}
          laborCode={formulaModal.row.costCode}
          description={formulaModal.row.item}
          unit={formulaModal.row.unit}
          dimensions={formulaModal.row.dimensions}
          openedFrom={formulaModal.openedFrom}
          currentQty={formulaModal.row.quantity}
          currentSecQty={formulaModal.row.secQuantity}
          onApply={(qty, secQty) => {
            if (formulaModal.row) handleFormulaApply(formulaModal.row.rowKey, qty, secQty);
          }}
        />
      )}
    </div>
  );
};

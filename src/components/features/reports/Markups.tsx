'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { GeneralRequirement, GcCategory } from '@/types';
import {
  MarkupFilterDropdown,
  MarkupFilterState,
} from '@/components/features/reports/MarkupFilterDropdown';
import type { ExtendedLineItem } from '@/components/features/reports/MaterialsView';
import type { MaterialCosting } from '@/types/assembly';

interface MarkupsProps {
  markupItems: ExtendedLineItem[];
  materialCostingData?: MaterialCosting[];
  priceMap: Record<string, { cost: number; per: number }>;
  currencySymbol?: string;
}

const normalizeAssemblyTypeForCategory = (raw: string): string => {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('ceiling')) return 'Ceiling';
  if (lower.includes('exterior')) return 'Exterior Walls';
  if (lower.includes('bulkhead')) return 'BulkHead';
  if (lower.includes('access') && lower.includes('panel')) return 'Access Pannel';
  if (lower.includes('hm') || lower.includes('hollow metal')) return 'HM Frames';
  return 'Interior Walls';
};

const flattenMaterialCostingToItems = (
  materialCostingData: MaterialCosting[]
): ExtendedLineItem[] => {
  const items: ExtendedLineItem[] = [];
  materialCostingData.forEach((asm) => {
    const ext = asm as {
      level?: string;
      assembly_type?: string;
      height_ft?: number;
      total_length?: number;
    };
    const levelStr = ext.level ?? 'Unknown';
    const assemblyType = normalizeAssemblyTypeForCategory(
      ext.assembly_type ?? 'wall'
    );
    const conditionType =
      typeof ext.height_ft === 'number' && typeof ext.total_length === 'number'
        ? `Assembly ${asm.assembly_id} (${ext.height_ft}' : ${ext.total_length} LF)`
        : `Assembly ${asm.assembly_id}`;

    (asm.materials_costing ?? []).forEach((costingItem) => {
      const { matched_materials, matched_labor } = costingItem;
      (matched_materials ?? []).forEach((mat) => {
        const qty = mat.quantity ?? 0;
        items.push({
          item: mat.description,
          quantity: qty,
          unit: mat.unit,
          category: 'Other',
          area: levelStr,
          assemblyType,
          conditionType,
          costCode: mat.section ?? '—',
          section: mat.section ?? '—',
          supplier: 'Generic',
          overridePrice: mat.unit_cost,
          code: mat.code,
          sect: mat.section,
        });
      });
      (matched_labor ?? []).forEach((lab) => {
        const qty =
          lab.quantity != null && typeof lab.quantity === 'number'
            ? lab.quantity
            : 0;
        items.push({
          item: lab.description,
          quantity: qty,
          unit: lab.unit,
          category: 'Labor',
          area: levelStr,
          assemblyType,
          conditionType,
          costCode: lab.section ?? '—',
          section: lab.section ?? '—',
          supplier: 'Generic',
          overridePrice: lab.unit_cost,
          code: lab.code,
          sect: lab.section,
        });
      });
    });
  });
  return items;
};

interface MarkupConfig {
  escalation: number;
  tax: number;
  laborBurden: number;
  overhead: number;
  profit: number;
}

const ASSEMBLY_CATEGORIES = [
  'Interior Walls',
  'Exterior Walls',
  'Ceiling',
  'BulkHead',
  'Access Pannel',
  'HM Frames',
] as const;

type AssemblyCategory = (typeof ASSEMBLY_CATEGORIES)[number];

const normalizeCategoryForDisplay = (cat: string | undefined): AssemblyCategory => {
  const c = cat || 'Interior Walls';
  if (c === 'Interior Wall') return 'Interior Walls';
  if (c === 'Exterior Wall') return 'Exterior Walls';
  if (c === 'Access Panel') return 'Access Pannel';
  if (c === 'Bulkhead') return 'BulkHead';
  if (c === 'Hollow Metal Frame') return 'HM Frames';
  return ASSEMBLY_CATEGORIES.includes(c as AssemblyCategory)
    ? (c as AssemblyCategory)
    : 'Interior Walls';
};

const parseLevels = (levelStr: string): string[] => {
  if (!levelStr || levelStr === 'Unknown' || levelStr === 'Manual') return [];
  return levelStr
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
};

const sortLevels = (levels: string[]): string[] =>
  [...levels].sort((a, b) => {
    const nA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return nA - nB;
  });

const getItemCost = (
  m: ExtendedLineItem,
  priceMap: Record<string, { cost: number; per: number }>
): number => {
  let pricing = priceMap[m.item];
  if (!pricing && m.item.includes('@'))
    pricing = priceMap[m.item.split('@')[0].trim()];
  if (m.overridePrice !== undefined) pricing = { cost: m.overridePrice, per: 1 };
  if (!pricing) return 0;
  let qty = m.quantity || 0;
  if (m.unit?.includes('sheet')) qty = (m.quantity || 0) * 48;
  return qty * (pricing.cost / (pricing.per || 1));
};

const getTradeFromCategory = (cat: string, desc: string): string => {
  const c = (cat || '').toLowerCase();
  const d = (desc || '').toLowerCase();
  if (c.includes('framing') || d.includes('stud') || d.includes('track'))
    return 'Framing';
  if (
    c.includes('ceiling') ||
    c.includes('drywall') ||
    c.includes('finishing') ||
    d.includes('board') ||
    d.includes('drywall') ||
    d.includes('mud') ||
    d.includes('tape')
  )
    return 'Dry Wall';
  if (
    c.includes('insulation') ||
    d.includes('insulation') ||
    d.includes('rockwool') ||
    d.includes('fiberglass') ||
    d.includes('batt') ||
    d.includes('mineral wool') ||
    d.includes('comfortbatt')
  )
    return 'Insulation';
  return 'Other';
};

export const MarkupsView: React.FC<MarkupsProps> = ({
  markupItems,
  materialCostingData = [],
  priceMap,
  currencySymbol = '$',
}) => {
  // Prefer pipeline output (materialCostingData) when available. For categories with empty materials_costing
  // (e.g. Ceiling, Bulkhead — "Assembly not found in material match"), fall back to markupItems from calculateMaterials.
  const effectiveMarkupItems = useMemo(() => {
    const fromCosting =
      materialCostingData.length > 0
        ? flattenMaterialCostingToItems(materialCostingData)
        : [];
    if (fromCosting.length === 0) return markupItems;

    const byCategoryTotal: Record<string, number> = {};
    ASSEMBLY_CATEGORIES.forEach((c) => {
      byCategoryTotal[c] = 0;
    });
    fromCosting.forEach((m) => {
      const norm = normalizeCategoryForDisplay(m.assemblyType);
      if (byCategoryTotal[norm] !== undefined) {
        byCategoryTotal[norm] += getItemCost(m, priceMap);
      }
    });
    const zeroCategories = new Set(
      ASSEMBLY_CATEGORIES.filter((c) => byCategoryTotal[c] === 0)
    );
    const fallbackItems = markupItems.filter((m) =>
      zeroCategories.has(normalizeCategoryForDisplay(m.assemblyType))
    );
    return [...fromCosting, ...fallbackItems];
  }, [markupItems, materialCostingData, priceMap]);
  const [config, setConfig] = useState<MarkupConfig>({
    escalation: 0,
    tax: 8.25,
    laborBurden: 15,
    overhead: 10,
    profit: 15,
  });

  const [filterState, setFilterState] = useState<MarkupFilterState>({
    selectedBreakdownTypes: new Set(),
    selectedLevels: new Set(),
  });

  const [generalConditions, setGeneralConditions] = useState<GeneralRequirement[]>([
    { id: 'st1', category: 'Staffing', description: 'Site Supervisor', quantity: 20, unit: 'wk', rate: 70 * 40, total: 0 },
    { id: 'st2', category: 'Staffing', description: 'Non-working Foreman', quantity: 0, unit: 'wk', rate: 70 * 40, total: 0 },
    { id: 'st3', category: 'Staffing', description: 'Project Manager', quantity: 15, unit: 'wk', rate: 65 * 10, total: 0 },
    { id: 'st4', category: 'Staffing', description: 'Health & Safety', quantity: 5, unit: 'wk', rate: 45 * 10, total: 0 },
    { id: 'gc1', category: 'Site', description: 'Weekly Cleaning', quantity: 0, unit: 'wk', rate: 600, total: 0 },
    { id: 'gc2', category: 'Site', description: 'Site Safety & Signage', quantity: 1, unit: 'ls', rate: 250, total: 0 },
    { id: 'gc3', category: 'Site', description: 'Small Tools & Supplies', quantity: 1, unit: 'ls', rate: 500, total: 0 },
    { id: 'gc4', category: 'Site', description: 'Scissor Lift', quantity: 1, unit: 'mo', rate: 1500, total: 0 },
    { id: 'gc5', category: 'Site', description: 'Deliveries / Hoisting', quantity: 5, unit: 'ea', rate: 250, total: 0 },
    { id: 'gc6', category: 'Site', description: 'Disposal / Bins', quantity: 5, unit: 'ea', rate: 600, total: 0 },
    { id: 'ad1', category: 'Admin', description: 'Project Documentation', quantity: 1, unit: 'ls', rate: 1000, total: 0 },
    { id: 'ad2', category: 'Admin', description: 'Fuel & Oil', quantity: 0, unit: 'wk', rate: 125, total: 0 },
  ]);

  const updateGcItem = useCallback(
    (id: string, field: keyof GeneralRequirement, value: string | number) => {
      setGeneralConditions((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          if (field === 'quantity' || field === 'rate')
            updated.total =
              (typeof updated.quantity === 'number' ? updated.quantity : 0) *
              (typeof updated.rate === 'number' ? updated.rate : 0);
          return updated;
        })
      );
    },
    []
  );

  const availableLevels = useMemo(() => {
    const levels = new Set<string>();
    effectiveMarkupItems.forEach((m) =>
      parseLevels(m.area || '').forEach((l) => levels.add(l))
    );
    return sortLevels(Array.from(levels).filter((l) => l && l !== 'Unknown'));
  }, [effectiveMarkupItems]);

  const filteredItems = useMemo(() => {
    if (filterState.selectedLevels.size === 0) return effectiveMarkupItems;
    return effectiveMarkupItems.filter((m) => {
      const levels = parseLevels(m.area || '');
      return levels.some((l) => filterState.selectedLevels.has(l));
    });
  }, [effectiveMarkupItems, filterState.selectedLevels]);

  const tradeBreakdown = useMemo(() => {
    const trades: Record<string, { material: number; labor: number }> = {
      'Dry Wall': { material: 0, labor: 0 },
      Framing: { material: 0, labor: 0 },
      Insulation: { material: 0, labor: 0 },
      Other: { material: 0, labor: 0 },
    };
    filteredItems.forEach((m) => {
      const cost = getItemCost(m, priceMap);
      const trade = getTradeFromCategory(m.category || '', m.item || '');
      const isLabor =
        m.category === 'Labor' ||
        (m.item || '').toLowerCase().includes('install') ||
        (m.item || '').toLowerCase().includes('labor');
      if (isLabor) trades[trade].labor += cost;
      else trades[trade].material += cost;
    });
    return trades;
  }, [filteredItems, priceMap]);

  const floorWiseBreakdown = useMemo(() => {
    const byLevel: Record<string, { material: number; labor: number }> = {};
    effectiveMarkupItems.forEach((m) => {
      const levels = parseLevels(m.area || '');
      const toProcess =
        filterState.selectedLevels.size > 0
          ? levels.filter((l) => filterState.selectedLevels.has(l))
          : levels.length > 0
            ? levels
            : ['Unknown'];
      const cost = getItemCost(m, priceMap);
      const isLabor =
        m.category === 'Labor' ||
        (m.item || '').toLowerCase().includes('install') ||
        (m.item || '').toLowerCase().includes('labor');
      toProcess.forEach((lvl) => {
        if (!byLevel[lvl]) byLevel[lvl] = { material: 0, labor: 0 };
        if (isLabor) byLevel[lvl].labor += cost / toProcess.length;
        else byLevel[lvl].material += cost / toProcess.length;
      });
    });
    return Object.entries(byLevel)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => {
        const nA = parseInt(a[0].replace(/\D/g, ''), 10) || 0;
        const nB = parseInt(b[0].replace(/\D/g, ''), 10) || 0;
        return nA - nB;
      });
  }, [effectiveMarkupItems, filterState.selectedLevels, priceMap]);

  const categoryBreakdown = useMemo(() => {
    const byCategory: Record<string, { material: number; labor: number }> = {};
    ASSEMBLY_CATEGORIES.forEach((c) => {
      byCategory[c] = { material: 0, labor: 0 };
    });
    filteredItems.forEach((m) => {
      const cat =
        m.assemblyType && ASSEMBLY_CATEGORIES.includes(m.assemblyType as (typeof ASSEMBLY_CATEGORIES)[number])
          ? m.assemblyType
          : 'Interior Walls';
      const norm =
        cat === 'Interior Wall'
          ? 'Interior Walls'
          : cat === 'Exterior Wall'
            ? 'Exterior Walls'
            : cat === 'Access Panel'
              ? 'Access Pannel'
              : cat === 'Bulkhead'
                ? 'BulkHead'
                : cat === 'Hollow Metal Frame'
                  ? 'HM Frames'
                  : cat;
      if (!byCategory[norm]) byCategory[norm] = { material: 0, labor: 0 };
      const cost = getItemCost(m, priceMap);
      const isLabor =
        m.category === 'Labor' ||
        (m.item || '').toLowerCase().includes('install') ||
        (m.item || '').toLowerCase().includes('labor');
      if (isLabor) byCategory[norm].labor += cost;
      else byCategory[norm].material += cost;
    });
    return byCategory;
  }, [filteredItems, priceMap]);

  const totals = useMemo(() => {
    let totalMaterial = 0;
    let totalLabor = 0;
    Object.values(tradeBreakdown).forEach((v) => {
      totalMaterial += v.material;
      totalLabor += v.labor;
    });
    const gcTotal = generalConditions.reduce(
      (s, i) => s + i.quantity * i.rate,
      0
    );
    const netDirectCost = totalMaterial + totalLabor;
    const grossCost = netDirectCost + gcTotal;
    const escalationCost = grossCost * (config.escalation / 100);
    const taxCost = totalMaterial * (config.tax / 100);
    const burdenCost = totalLabor * (config.laborBurden / 100);
    const subTotalWithTaxes =
      grossCost + escalationCost + taxCost + burdenCost;
    const overheadCost = subTotalWithTaxes * (config.overhead / 100);
    const profitBasis = subTotalWithTaxes + overheadCost;
    const profitCost = profitBasis * (config.profit / 100);
    const finalTotal = profitBasis + profitCost;
    return {
      totalMaterial,
      totalLabor,
      gcTotal,
      netDirectCost,
      grossCost,
      escalationCost,
      taxCost,
      burdenCost,
      subTotalWithTaxes,
      overheadCost,
      profitCost,
      finalTotal,
    };
  }, [tradeBreakdown, generalConditions, config]);

  const pieData = useMemo(
    () =>
      [
        { name: 'Material', value: totals.totalMaterial, color: '#22c55e' },
        { name: 'Labor', value: totals.totalLabor, color: '#3b82f6' },
        { name: 'Gen. Req.', value: totals.gcTotal, color: '#ef4444' },
        {
          name: 'Markups',
          value: totals.finalTotal - totals.grossCost,
          color: '#a855f7',
        },
      ].filter((d) => d.value > 0),
    [totals]
  );

  const formatCurrency = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );

  const handleFilterChange = useCallback((state: MarkupFilterState) => {
    setFilterState(state);
  }, []);

  const renderBreakdownTable = (
    rows: Array<{ name: string; material: number; labor: number }>,
    showSubtotal?: boolean,
    showAllRows?: boolean
  ) => (
    <table className="w-full text-sm mb-4">
      <thead>
        <tr className="text-slate-500 border-b border-slate-200">
          <th className="text-left font-medium py-2 pl-2">Trade / Category</th>
          <th className="text-right font-medium py-2 w-32">Material Cost</th>
          <th className="text-right font-medium py-2 w-32">Labor Cost</th>
          <th className="text-right font-medium py-2 w-32 font-bold text-slate-700">
            Total
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {(showAllRows ? rows : rows.filter((r) => r.material > 0 || r.labor > 0))
          .map((r) => (
            <tr key={r.name} className="hover:bg-slate-50 transition-colors">
              <td className="py-3 pl-2 text-slate-700 font-medium">{r.name}</td>
              <td className="py-3 text-right text-slate-600">
                {formatCurrency(r.material)}
              </td>
              <td className="py-3 text-right text-slate-600">
                {formatCurrency(r.labor)}
              </td>
              <td className="py-3 text-right font-bold text-slate-800 bg-slate-50/50">
                {formatCurrency(r.material + r.labor)}
              </td>
            </tr>
          ))}
        {showSubtotal && (
          <tr className="bg-slate-100 font-bold border-t border-slate-200">
            <td className="py-3 pl-2 text-slate-800">Direct Cost Subtotal</td>
            <td className="py-3 text-right text-slate-800">
              {formatCurrency(totals.totalMaterial)}
            </td>
            <td className="py-3 text-right text-slate-800">
              {formatCurrency(totals.totalLabor)}
            </td>
            <td className="py-3 text-right text-slate-900 bg-slate-200/50">
              {formatCurrency(totals.netDirectCost)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const renderGcSection = (title: string, category: GcCategory) => (
    <div className="mb-6">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 border-b pb-1">
        {title}
      </h4>
      <div className="space-y-1">
        {generalConditions
          .filter((i) => i.category === category)
          .map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 text-sm hover:bg-slate-50 p-1 rounded group"
            >
              <input
                type="text"
                value={item.description}
                onChange={(e) =>
                  updateGcItem(item.id, 'description', e.target.value)
                }
                className="flex-1 bg-transparent border-none outline-none text-slate-700 font-medium text-xs focus:ring-0 p-0"
              />
              <div className="flex items-center gap-1 w-20">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    updateGcItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                  }
                  className="w-12 text-right border border-slate-200 rounded px-1 text-xs focus:border-emerald-500 outline-none"
                />
                <span className="text-slate-400 text-[10px] w-6">{item.unit}</span>
              </div>
              <div className="w-20 text-right">
                <input
                  type="number"
                  value={item.rate}
                  onChange={(e) =>
                    updateGcItem(item.id, 'rate', parseFloat(e.target.value) || 0)
                  }
                  className="w-full text-right border-none bg-transparent outline-none text-xs text-slate-500"
                />
              </div>
              <div className="w-20 text-right font-medium text-slate-800">
                {formatCurrency(item.quantity * item.rate)}
              </div>
              <button
                onClick={() =>
                  setGeneralConditions((prev) =>
                    prev.filter((g) => g.id !== item.id)
                  )
                }
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1"
                aria-label="Remove item"
              >
                &times;
              </button>
            </div>
          ))}
        <button
          onClick={() =>
            setGeneralConditions((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                category,
                description: 'New Item',
                quantity: 0,
                unit: 'ls',
                rate: 0,
                total: 0,
              },
            ])
          }
          className="text-[10px] text-emerald-600 font-medium hover:underline mt-1 pl-1"
        >
          + Add {title} Item
        </button>
      </div>
    </div>
  );

  const showTrade =
    filterState.selectedBreakdownTypes.size === 0 ||
    filterState.selectedBreakdownTypes.has('Trade Breakdown');
  const showFloorWise = filterState.selectedBreakdownTypes.has(
    'Floor Wise Breakdown'
  );
  const showCategory = filterState.selectedBreakdownTypes.has(
    'Interior and Exterior Envelop'
  );

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden flex-col">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 shrink-0">
        <MarkupFilterDropdown
          availableLevels={availableLevels}
          filterState={filterState}
          onFilterChange={handleFilterChange}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="flex gap-8 mb-8">
              <div className="w-1/4 bg-white p-4 rounded-lg shadow-sm border border-slate-100 flex flex-col items-center justify-start shrink-0">
                <h3 className="text-sm font-medium text-slate-500 mb-4 w-full text-left">
                  Cost Distribution
                </h3>
                <div
                  className="relative w-40 h-40 rounded-full"
                  style={{
                    background: `conic-gradient(${(() => {
                      let currentAngle = 0;
                      const total = pieData.reduce((s, i) => s + i.value, 0);
                      return pieData
                        .map((d) => {
                          const start = currentAngle;
                          const angle =
                            total > 0 ? (d.value / total) * 360 : 0;
                          currentAngle += angle;
                          return `${d.color} ${start}deg ${currentAngle}deg`;
                        })
                        .join(', ');
                    })()})`,
                  }}
                >
                  <div className="absolute inset-0 m-auto w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-inner">
                    <span className="text-xs font-bold text-slate-500">
                      Total
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-6 w-full px-2">
                  {pieData.map((d) => (
                    <div
                      key={d.name}
                      className="flex justify-between items-center text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: d.color }}
                        />
                        <span className="text-slate-600">{d.name}</span>
                      </div>
                      <span className="font-medium text-slate-800">
                        {currencySymbol}
                        {formatCurrency(d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 bg-white p-6 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-6 min-w-0">
                {showTrade && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      Trade Breakdown (Division 05-09)
                    </h2>
                    {filterState.selectedLevels.size > 0 && (
                      <p className="text-xs text-slate-500 mb-2">
                        Filtered by: {Array.from(filterState.selectedLevels).join(', ')}
                      </p>
                    )}
                    {renderBreakdownTable(
                      Object.entries(tradeBreakdown).map(([name, c]) => ({
                        name,
                        material: c.material,
                        labor: c.labor,
                      })),
                      true
                    )}
                  </div>
                )}

                {showFloorWise && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      Floor Wise Breakdown
                    </h2>
                    <p className="text-xs text-slate-500 mb-2">
                      Level-wise expense (Material + Labor)
                    </p>
                    {renderBreakdownTable(
                      floorWiseBreakdown.map(([level, c]) => ({
                        name: level,
                        material: c.material,
                        labor: c.labor,
                      }))
                    )}
                  </div>
                )}

                {showCategory && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      Interior and Exterior Envelop
                    </h2>
                    <p className="text-xs text-slate-500 mb-2">
                      Category-wise breakdown
                    </p>
                    {renderBreakdownTable(
                      ASSEMBLY_CATEGORIES.map((cat) => ({
                        name: cat,
                        material: categoryBreakdown[cat]?.material ?? 0,
                        labor: categoryBreakdown[cat]?.labor ?? 0,
                      })),
                      false,
                      true
                    )}
                  </div>
                )}

                {!showTrade && !showFloorWise && !showCategory && (
                  <p className="text-sm text-slate-500 py-4">
                    Select a breakdown type from the filter to view data.
                  </p>
                )}

                <div className="border-t border-dashed border-slate-200 pt-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex justify-between items-center">
                    <span>General Requirements (Division 01)</span>
                    <span className="text-sm font-normal text-slate-500">
                      {currencySymbol}
                      {formatCurrency(totals.gcTotal)}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                    {renderGcSection('Staffing / Supervision', 'Staffing')}
                    {renderGcSection('General Conditions', 'Site')}
                    {renderGcSection('Administrative', 'Admin')}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mt-2">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">
                    Final Calculations
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Net Direct Cost</span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(totals.netDirectCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        General Requirements
                      </span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(totals.gcTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                      <span className="text-slate-700">Gross Cost (Base)</span>
                      <span className="text-slate-800">
                        {formatCurrency(totals.grossCost)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pl-4 border-l-2 border-blue-200 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Escalation</span>
                        <input
                          type="number"
                          value={config.escalation}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              escalation: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center text-xs border rounded bg-white px-1"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <span>{formatCurrency(totals.escalationCost)}</span>
                    </div>
                    <div className="flex justify-between items-center pl-4 border-l-2 border-green-200">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Tax</span>
                        <input
                          type="number"
                          value={config.tax}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              tax: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center text-xs border rounded bg-white px-1"
                        />
                        <span className="text-xs text-slate-400">
                          % (Mat Only)
                        </span>
                      </div>
                      <span>{formatCurrency(totals.taxCost)}</span>
                    </div>
                    <div className="flex justify-between items-center pl-4 border-l-2 border-red-200">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Labor Burden</span>
                        <input
                          type="number"
                          value={config.laborBurden}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              laborBurden: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center text-xs border rounded bg-white px-1"
                        />
                        <span className="text-xs text-slate-400">
                          % (Lab Only)
                        </span>
                      </div>
                      <span>{formatCurrency(totals.burdenCost)}</span>
                    </div>
                    <div className="border-t border-slate-200 my-2" />
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>Total with Direct Markups</span>
                      <span>{formatCurrency(totals.subTotalWithTaxes)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Overhead</span>
                        <input
                          type="number"
                          value={config.overhead}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              overhead: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center text-xs border rounded bg-white px-1"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <span>{formatCurrency(totals.overheadCost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Profit</span>
                        <input
                          type="number"
                          value={config.profit}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              profit: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-12 text-center text-xs border rounded bg-white px-1"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <span>{formatCurrency(totals.profitCost)}</span>
                    </div>
                    <div className="bg-slate-800 text-white p-3 rounded flex justify-between items-center mt-4">
                      <span className="font-bold text-lg">Total Bid Price</span>
                      <span className="font-bold text-xl">
                        {currencySymbol}
                        {formatCurrency(totals.finalTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

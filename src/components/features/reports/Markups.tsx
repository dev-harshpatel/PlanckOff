'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  MarkupFilterDropdown,
  MarkupFilterState,
} from '@/components/features/reports/MarkupFilterDropdown';
import type { ExtendedLineItem } from '@/components/features/reports/MaterialsView';
import type { MaterialCosting } from '@/types/assembly';
import { useSessionStorageSetState } from '@/hooks/useSessionStorageSetState';
import { pruneSelectedFilterValues } from '@/lib/utils/reportFilterState';
import { ProjectInfoPanel } from '@/components/features/reports/markups/ProjectInfoPanel';
import { StaffingSection } from '@/components/features/reports/markups/StaffingSection';
import { GeneralConditionsSection } from '@/components/features/reports/markups/GeneralConditionsSection';
import { TravelHotelSection } from '@/components/features/reports/markups/TravelHotelSection';
import { AdministrativeSection } from '@/components/features/reports/markups/AdministrativeSection';
import { InflationSection } from '@/components/features/reports/markups/InflationSection';
import {
  calcStaffingRowTotal,
  calcGcRowTotal,
  calcTravelHotel,
  calcAdministrativeRowTotal,
  calcInflation,
} from '@/components/features/reports/markups/formulas';
import {
  DEFAULT_ADMINISTRATIVE_ROWS,
  DEFAULT_INFLATION_CONFIG,
  DEFAULT_PROJECT_INFO,
  DEFAULT_STAFFING_ROWS,
  DEFAULT_GENERAL_CONDITIONS_ROWS,
  DEFAULT_TRAVEL_HOTEL_CONFIG,
  type AdministrativeField,
  type AdministrativeRow,
  type InflationConfig,
  type ProjectInfo,
  type StaffingRow,
  type GeneralConditionsRow,
  type GcNumericField,
  type TravelHotelConfig,
} from '@/components/features/reports/markups/types';

interface MarkupsProps {
  markupItems: ExtendedLineItem[];
  materialCostingData?: MaterialCosting[];
  priceMap: Record<string, { cost: number; per: number }>;
  currencySymbol?: string;
  filterStorageKey?: string;
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
  filterStorageKey = 'project-report:markups',
}) => {
  const effectiveMarkupItems = useMemo(() => {
    if (materialCostingData.length > 0) {
      return flattenMaterialCostingToItems(materialCostingData);
    }
    return markupItems;
  }, [markupItems, materialCostingData]);

  const markupBaseData = useMemo(() => {
    const availableLevels = new Set<string>();
    const normalizedItems = effectiveMarkupItems.map((item) => {
      const levels = parseLevels(item.area || '');
      levels.forEach((level) => availableLevels.add(level));
      const cost = getItemCost(item, priceMap);
      const isLabor =
        item.category === 'Labor' ||
        (item.item || '').toLowerCase().includes('install') ||
        (item.item || '').toLowerCase().includes('labor');
      return {
        ...item,
        parsedLevels: levels,
        normalizedAssemblyType: normalizeCategoryForDisplay(item.assemblyType),
        trade: getTradeFromCategory(item.category || '', item.item || ''),
        cost,
        isLabor,
      };
    });

    return {
      items: normalizedItems,
      availableLevels: sortLevels(Array.from(availableLevels).filter((level) => level && level !== 'Unknown')),
    };
  }, [effectiveMarkupItems, priceMap]);

  const [config, setConfig] = useState<MarkupConfig>({
    escalation: 0,
    tax: 8.25,
    laborBurden: 15,
    overhead: 10,
    profit: 15,
  });

  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(DEFAULT_PROJECT_INFO);
  const [staffingRows, setStaffingRows] = useState<StaffingRow[]>(DEFAULT_STAFFING_ROWS);

  const handleProjectInfoChange = useCallback((info: ProjectInfo) => {
    setProjectInfo(info);
  }, []);

  const handleStaffingRowChange = useCallback(
    (id: string, field: 'workers' | 'percentTime' | 'hourlyRate' | 'durationWeeks', value: number) => {
      setStaffingRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const [gcRows, setGcRows] = useState<GeneralConditionsRow[]>(DEFAULT_GENERAL_CONDITIONS_ROWS);

  const handleGcRowChange = useCallback(
    (id: string, field: GcNumericField, value: number) => {
      setGcRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const [travelHotelConfig, setTravelHotelConfig] = useState<TravelHotelConfig>(
    DEFAULT_TRAVEL_HOTEL_CONFIG,
  );

  const handleTravelHotelChange = useCallback((cfg: TravelHotelConfig) => {
    setTravelHotelConfig(cfg);
  }, []);

  const [inflationConfig, setInflationConfig] = useState<InflationConfig>(
    DEFAULT_INFLATION_CONFIG,
  );

  const handleInflationChange = useCallback((cfg: InflationConfig) => {
    setInflationConfig(cfg);
  }, []);

  const createDefaultFilterState = useCallback(
    (): MarkupFilterState => ({
      selectedBreakdownTypes: new Set(),
      selectedLevels: new Set(),
    }),
    [],
  );
  const [filterState, setFilterState] =
    useSessionStorageSetState<MarkupFilterState>(
      filterStorageKey,
      createDefaultFilterState,
    );

  const [administrativeRows, setAdministrativeRows] = useState<AdministrativeRow[]>(DEFAULT_ADMINISTRATIVE_ROWS);

  const handleAdministrativeRowChange = useCallback(
    (id: string, field: AdministrativeField, value: string | number | boolean) => {
      setAdministrativeRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const handleAddAdministrativeRow = useCallback(() => {
    setAdministrativeRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: 'New Item',
        formulaType: 'lump_sum',
        isCustom: true,
        amount: 0,
        parkingSpots: 0,
        months: 0,
        monthlyParkingCost: 0,
        weeklyBudget: 0,
        durationWeeks: 0,
      },
    ]);
  }, []);

  const handleRemoveAdministrativeRow = useCallback((id: string) => {
    setAdministrativeRows((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const availableLevels = markupBaseData.availableLevels;

  const filteredItems = useMemo(() => {
    if (filterState.selectedLevels.size === 0) return markupBaseData.items;
    return markupBaseData.items.filter((item) => {
      return item.parsedLevels.some((level) => filterState.selectedLevels.has(level));
    });
  }, [markupBaseData, filterState.selectedLevels]);

  // allTradeBreakdown: unfiltered — used for ALL cost totals (GC, markup chain, final total).
  // Filters must never change the project total.
  const allTradeBreakdown = useMemo(() => {
    const trades: Record<string, { material: number; labor: number }> = {
      'Dry Wall': { material: 0, labor: 0 },
      Framing: { material: 0, labor: 0 },
      Insulation: { material: 0, labor: 0 },
      Other: { material: 0, labor: 0 },
    };
    markupBaseData.items.forEach((item) => {
      if (item.isLabor) trades[item.trade].labor += item.cost;
      else trades[item.trade].material += item.cost;
    });
    return trades;
  }, [markupBaseData.items]);

  // tradeBreakdown: filtered view — used ONLY for the breakdown display table.
  const tradeBreakdown = useMemo(() => {
    const trades: Record<string, { material: number; labor: number }> = {
      'Dry Wall': { material: 0, labor: 0 },
      Framing: { material: 0, labor: 0 },
      Insulation: { material: 0, labor: 0 },
      Other: { material: 0, labor: 0 },
    };
    filteredItems.forEach((item) => {
      if (item.isLabor) trades[item.trade].labor += item.cost;
      else trades[item.trade].material += item.cost;
    });
    return trades;
  }, [filteredItems]);

  const floorWiseBreakdown = useMemo(() => {
    const byLevel: Record<string, { material: number; labor: number }> = {};
    markupBaseData.items.forEach((item) => {
      const levels = item.parsedLevels;
      const toProcess =
        filterState.selectedLevels.size > 0
          ? levels.filter((l) => filterState.selectedLevels.has(l))
          : levels.length > 0
            ? levels
            : ['Unknown'];
      toProcess.forEach((lvl) => {
        if (!byLevel[lvl]) byLevel[lvl] = { material: 0, labor: 0 };
        if (item.isLabor) byLevel[lvl].labor += item.cost / toProcess.length;
        else byLevel[lvl].material += item.cost / toProcess.length;
      });
    });
    return Object.entries(byLevel)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => {
        const nA = parseInt(a[0].replace(/\D/g, ''), 10) || 0;
        const nB = parseInt(b[0].replace(/\D/g, ''), 10) || 0;
        return nA - nB;
      });
  }, [filterState.selectedLevels, markupBaseData]);

  const categoryBreakdown = useMemo(() => {
    const byCategory: Record<string, { material: number; labor: number }> = {};
    ASSEMBLY_CATEGORIES.forEach((c) => {
      byCategory[c] = { material: 0, labor: 0 };
    });
    filteredItems.forEach((item) => {
      if (!byCategory[item.normalizedAssemblyType]) {
        byCategory[item.normalizedAssemblyType] = { material: 0, labor: 0 };
      }
      if (item.isLabor) byCategory[item.normalizedAssemblyType].labor += item.cost;
      else byCategory[item.normalizedAssemblyType].material += item.cost;
    });
    return byCategory;
  }, [filteredItems]);

  const staffingTotal = useMemo(
    () =>
      staffingRows.reduce(
        (sum, row) => sum + calcStaffingRowTotal(row, projectInfo.durationWeeks, projectInfo.workingHoursPerWeek),
        0,
      ),
    [staffingRows, projectInfo.durationWeeks, projectInfo.workingHoursPerWeek],
  );

  const administrativeTotal = useMemo(
    () =>
      administrativeRows.reduce(
        (sum, row) => sum + calcAdministrativeRowTotal(row, projectInfo.durationWeeks),
        0,
      ),
    [administrativeRows, projectInfo.durationWeeks],
  );

  const gcConditionsTotal = useMemo(
    () =>
      gcRows.reduce(
        (sum, row) => sum + calcGcRowTotal(row, projectInfo.durationWeeks, projectInfo.durationMonths, projectInfo.workingHoursPerWeek),
        0,
      ),
    [gcRows, projectInfo.durationWeeks, projectInfo.durationMonths, projectInfo.workingHoursPerWeek],
  );

  // Derived separately to avoid circular dependency inside the `totals` useMemo
  const totalMaterialFromTrades = useMemo(
    () => Object.values(allTradeBreakdown).reduce((sum, v) => sum + v.material, 0),
    [allTradeBreakdown],
  );

  const totalLaborFromTrades = useMemo(
    () => Object.values(allTradeBreakdown).reduce((sum, v) => sum + v.labor, 0),
    [allTradeBreakdown],
  );

  const travelHotelTotal = useMemo(
    () => calcTravelHotel(travelHotelConfig, totalLaborFromTrades).total,
    [travelHotelConfig, totalLaborFromTrades],
  );

  const inflationTotal = useMemo(
    () => calcInflation(inflationConfig, totalLaborFromTrades, totalMaterialFromTrades).total,
    [inflationConfig, totalLaborFromTrades, totalMaterialFromTrades],
  );

  const totals = useMemo(() => {
    let totalMaterial = 0;
    let totalLabor = 0;
    Object.values(allTradeBreakdown).forEach((v) => {
      totalMaterial += v.material;
      totalLabor += v.labor;
    });
    const gcTotal =
      administrativeTotal +
      staffingTotal +
      gcConditionsTotal +
      travelHotelTotal +
      inflationTotal;
    const netDirectCost = totalMaterial + totalLabor;
    const grossCost = netDirectCost + gcTotal;
    const escalationCost = netDirectCost * (config.escalation / 100);
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
  }, [allTradeBreakdown, administrativeTotal, staffingTotal, gcConditionsTotal, travelHotelTotal, inflationTotal, config]);

  const pieData = useMemo(
    () => [
      { name: 'Material', value: totals.totalMaterial, color: '#22c55e' },
      { name: 'Labor', value: totals.totalLabor, color: '#3b82f6' },
      { name: 'Gen. Req.', value: totals.gcTotal, color: '#ef4444' },
      { name: 'Markups', value: totals.finalTotal - totals.grossCost, color: '#a855f7' },
    ],
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

  React.useEffect(() => {
    setFilterState((prev) => {
      const nextLevels = pruneSelectedFilterValues(
        prev.selectedLevels,
        availableLevels,
      );

      if (nextLevels === prev.selectedLevels) return prev;

      return {
        ...prev,
        selectedLevels: nextLevels,
      };
    });
  }, [availableLevels, setFilterState]);

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
            <ProjectInfoPanel info={projectInfo} onChange={handleProjectInfoChange} />

            {/* Cost Distribution — horizontal top card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4 mb-6 flex items-center gap-8">
              <div
                className="relative w-32 h-32 rounded-full shrink-0"
                style={{
                  background: (() => {
                    const total = pieData.reduce((s, i) => s + i.value, 0);
                    if (total === 0) return '#e2e8f0';
                    let currentAngle = 0;
                    const segments = pieData
                      .filter((d) => d.value > 0)
                      .map((d) => {
                        const start = currentAngle;
                        const angle = (d.value / total) * 360;
                        currentAngle += angle;
                        return `${d.color} ${start}deg ${currentAngle}deg`;
                      })
                      .join(', ');
                    return `conic-gradient(${segments})`;
                  })(),
                }}
              >
                <div className="absolute inset-0 m-auto w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-inner">
                  <span className="text-xs font-bold text-slate-500">Total</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Cost Distribution</p>
                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-slate-600">{d.name}</span>
                      <span className="font-semibold text-slate-800">
                        {currencySymbol}{formatCurrency(d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-6">
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

                  {/* Staffing — full width, formula-driven */}
                  <StaffingSection
                    rows={staffingRows}
                    durationWeeks={projectInfo.durationWeeks}
                    workingHoursPerWeek={projectInfo.workingHoursPerWeek}
                    onRowChange={handleStaffingRowChange}
                    currencySymbol={currencySymbol}
                  />

                  {/* General Conditions — full width, formula-driven */}
                  <GeneralConditionsSection
                    rows={gcRows}
                    durationWeeks={projectInfo.durationWeeks}
                    durationMonths={projectInfo.durationMonths}
                    workingHoursPerWeek={projectInfo.workingHoursPerWeek}
                    onRowChange={handleGcRowChange}
                    currencySymbol={currencySymbol}
                  />

                  {/* Travel & Hotel — formula-driven */}
                  <TravelHotelSection
                    config={travelHotelConfig}
                    totalLaborCost={totalLaborFromTrades}
                    onChange={handleTravelHotelChange}
                    currencySymbol={currencySymbol}
                  />

                  <InflationSection
                    config={inflationConfig}
                    totalLaborCost={totalLaborFromTrades}
                    totalMaterialCost={totalMaterialFromTrades}
                    onChange={handleInflationChange}
                    currencySymbol={currencySymbol}
                  />

                  <AdministrativeSection
                    rows={administrativeRows}
                    durationWeeks={projectInfo.durationWeeks}
                    onRowChange={handleAdministrativeRowChange}
                    onAddCustomRow={handleAddAdministrativeRow}
                    onRemoveRow={handleRemoveAdministrativeRow}
                    currencySymbol={currencySymbol}
                  />
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

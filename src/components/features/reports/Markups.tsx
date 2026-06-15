'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { applyMarkupChain, type MarkupConfig } from '@/lib/utils/markupChain';
import {
  MarkupFilterDropdown,
  MarkupFilterState,
} from '@/components/features/reports/MarkupFilterDropdown';
import { useReportFilters } from '@/hooks/useReportFilters';
import { pruneSelectedFilterValues } from '@/lib/utils/reportFilterState';
import { useProjectDataContext } from '@/context/ProjectDataContext';
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
  currencySymbol?: string;
  filterStorageKey?: string;
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

export const MarkupsView: React.FC<MarkupsProps> = ({
  currencySymbol = '$',
  filterStorageKey = 'project-report:markups',
}) => {
  // All cost totals come from the canonical context — never recomputed here.
  // See: calculations.md § 0 (Cardinal Law) and state-management.md § 1
  const { projectCosts } = useProjectDataContext();

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
  const [filterState, setFilterState] = useReportFilters<MarkupFilterState>(
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

  // Derive available levels from canonical lineItems
  const availableLevels = useMemo(() => {
    const levels = new Set<string>();
    projectCosts.lineItems.forEach((item) => {
      parseLevels(item.area).forEach((level) => levels.add(level));
    });
    return sortLevels(Array.from(levels).filter((level) => !!level && level !== 'Unknown'));
  }, [projectCosts.lineItems]);

  // filteredLineItems — view-only. Markup chain totals always use projectCosts (unfiltered).
  const filteredLineItems = useMemo(() => {
    if (filterState.selectedLevels.size === 0) return projectCosts.lineItems;
    return projectCosts.lineItems.filter((item) =>
      parseLevels(item.area).some((level) => filterState.selectedLevels.has(level)),
    );
  }, [projectCosts.lineItems, filterState.selectedLevels]);

  // tradeBreakdown: filtered view — used ONLY for the breakdown display table.
  // Markup chain always uses projectCosts.byTrade (unfiltered).
  const tradeBreakdown = useMemo(() => {
    const trades: Record<string, { material: number; labor: number }> = {
      'Dry Wall': { material: 0, labor: 0 },
      Framing: { material: 0, labor: 0 },
      Insulation: { material: 0, labor: 0 },
      Other: { material: 0, labor: 0 },
    };
    filteredLineItems.forEach((item) => {
      if (!trades[item.trade]) trades[item.trade] = { material: 0, labor: 0 };
      if (item.isLabor) trades[item.trade].labor += item.totalCost;
      else trades[item.trade].material += item.totalCost;
    });
    return trades;
  }, [filteredLineItems]);

  const floorWiseBreakdown = useMemo(() => {
    const byLevel: Record<string, { material: number; labor: number }> = {};
    projectCosts.lineItems.forEach((item) => {
      const levels = parseLevels(item.area);
      const toProcess =
        filterState.selectedLevels.size > 0
          ? levels.filter((l) => filterState.selectedLevels.has(l))
          : levels.length > 0
            ? levels
            : ['Unknown'];
      toProcess.forEach((lvl) => {
        if (!byLevel[lvl]) byLevel[lvl] = { material: 0, labor: 0 };
        if (item.isLabor) byLevel[lvl].labor += item.totalCost / toProcess.length;
        else byLevel[lvl].material += item.totalCost / toProcess.length;
      });
    });
    return Object.entries(byLevel)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => {
        const nA = parseInt(a[0].replace(/\D/g, ''), 10) || 0;
        const nB = parseInt(b[0].replace(/\D/g, ''), 10) || 0;
        return nA - nB;
      });
  }, [filterState.selectedLevels, projectCosts.lineItems]);

  const categoryBreakdown = useMemo(() => {
    const byCategory: Record<string, { material: number; labor: number }> = {};
    ASSEMBLY_CATEGORIES.forEach((c) => {
      byCategory[c] = { material: 0, labor: 0 };
    });
    filteredLineItems.forEach((item) => {
      const cat = item.assemblyType as AssemblyCategory;
      if (!byCategory[cat]) {
        byCategory[cat] = { material: 0, labor: 0 };
      }
      if (item.isLabor) byCategory[cat].labor += item.totalCost;
      else byCategory[cat].material += item.totalCost;
    });
    return byCategory;
  }, [filteredLineItems]);

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

  const travelHotelTotal = useMemo(
    () => calcTravelHotel(travelHotelConfig, projectCosts.totalLabor).total,
    [travelHotelConfig, projectCosts.totalLabor],
  );

  const inflationTotal = useMemo(
    () => calcInflation(inflationConfig, projectCosts.totalLabor, projectCosts.totalMaterial).total,
    [inflationConfig, projectCosts.totalLabor, projectCosts.totalMaterial],
  );

  // totals: gcTotal is the ONLY new calculation Markups owns.
  // All material/labor inputs come from projectCosts — never recomputed here.
  // See: calculations.md § 3 (Markup Chain order)
  const totals = useMemo(() => {
    const gcTotal =
      administrativeTotal +
      staffingTotal +
      gcConditionsTotal +
      travelHotelTotal +
      inflationTotal;
    return applyMarkupChain(
      { totalMaterial: projectCosts.totalMaterial, totalLabor: projectCosts.totalLabor, gcTotal },
      config,
    );
  }, [
    projectCosts.totalMaterial,
    projectCosts.totalLabor,
    administrativeTotal,
    staffingTotal,
    gcConditionsTotal,
    travelHotelTotal,
    inflationTotal,
    config,
  ]);

  const pieData = useMemo(
    () => [
      { name: 'Material', value: totals.totalMaterial, color: '#22c55e' },
      { name: 'Labor', value: totals.totalLabor, color: '#3b82f6' },
      { name: 'Gen. Req.', value: totals.gcTotal, color: '#ef4444' },
      { name: 'Markups', value: totals.finalTotal - totals.grossCost, color: '#a855f7' },
    ],
    [totals],
  );

  const formatCurrency = useCallback(
    (val: number) =>
      val.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [],
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
    showAllRows?: boolean,
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
        {(showAllRows ? rows : rows.filter((r) => r.material > 0 || r.labor > 0)).map((r) => (
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
  const showFloorWise = filterState.selectedBreakdownTypes.has('Floor Wise Breakdown');
  const showCategory = filterState.selectedBreakdownTypes.has('Interior and Exterior Envelop');

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
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                  Cost Distribution
                </p>
                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: d.color }}
                      />
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
                      true,
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
                      })),
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
                      true,
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

                  {/* Travel & Hotel — formula-driven, uses canonical labor total */}
                  <TravelHotelSection
                    config={travelHotelConfig}
                    totalLaborCost={projectCosts.totalLabor}
                    onChange={handleTravelHotelChange}
                    currencySymbol={currencySymbol}
                  />

                  <InflationSection
                    config={inflationConfig}
                    totalLaborCost={projectCosts.totalLabor}
                    totalMaterialCost={projectCosts.totalMaterial}
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
                      <span className="text-slate-600">General Requirements</span>
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
                        <span className="text-xs text-slate-400">% (Mat Only)</span>
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
                        <span className="text-xs text-slate-400">% (Lab Only)</span>
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
                    {/* Markup percentage validation warnings */}
                    {(config.escalation > 20 ||
                      config.tax > 15 ||
                      config.laborBurden > 40 ||
                      config.overhead > 30 ||
                      config.profit > 40) && (
                      <div className="flex flex-col gap-1 mt-2 mb-1">
                        {config.escalation > 20 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-medium">
                              Escalation above 20% is unusual — verify with project team
                            </span>
                          </div>
                        )}
                        {config.tax > 15 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-medium">
                              Tax rate above 15% — verify jurisdiction
                            </span>
                          </div>
                        )}
                        {config.laborBurden > 40 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-medium">
                              Labour burden above 40% is high — verify with HR
                            </span>
                          </div>
                        )}
                        {config.overhead > 30 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-medium">
                              Overhead above 30% — verify with finance
                            </span>
                          </div>
                        )}
                        {config.profit > 40 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle size={11} />
                            <span className="text-[10px] font-medium">
                              Profit above 40% is unusually high
                            </span>
                          </div>
                        )}
                      </div>
                    )}
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

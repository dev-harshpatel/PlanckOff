'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { ExportModal } from '@/components/features/reports/ExportModal';
import type { ExportColumnDef, ExportRow } from '@/lib/utils/exportUtils';
import {
  MaterialsFilterDropdown,
  MaterialsFilterState,
} from '@/components/features/reports/MaterialsFilterDropdown';
import { useReportFilters } from '@/hooks/useReportFilters';
import { pruneSelectedFilterValues } from '@/lib/utils/reportFilterState';
import type {
  MaterialCosting,
  MaterialsCostingItem,
  MatchedMaterial,
  MatchedLabor,
} from "@/types/assembly";

interface MatLabViewProps {
  materialCostingData: MaterialCosting[];
  filterStorageKey?: string;
}

interface AggregatedLaborRow {
  labKey: string;
  code: string;
  item: string;
  section: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  areas: string[];
}

interface AggregatedMaterialGroup {
  matKey: string;
  code: string;
  item: string;
  section: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  areas: string[];
  labor: AggregatedLaborRow[];
}

interface MatContribution {
  code: string;
  item: string;
  section: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  areas: string[];
}

interface LabContribution {
  code: string;
  item: string;
  section: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  areas: string[];
}

const LOG_DEBUG = process.env.NEXT_PUBLIC_LOG_MATLAB_DEBUG === 'true';

const formatCurrency = (val: number) =>
  val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseLevels = (levelStr: string): string[] => {
  if (!levelStr || levelStr === 'Unknown') return [];
  return levelStr.split(',').map((l) => l.trim()).filter(Boolean);
};

const sortLevels = (levels: string[]): string[] =>
  [...levels].sort((a, b) => {
    const nA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return nA - nB;
  });

const getQuantityFromExtracted = (
  ext: MaterialsCostingItem['extracted_material'],
  unit: string
): number => {
  if (!ext) return 0;
  const totalLength = (ext as { total_length?: number }).total_length ?? 0;
  const heightFt = (ext as { height_ft?: number }).height_ft ?? 0;
  const ceilingArea = (ext as { ceiling_area?: number }).ceiling_area ?? 0;
  const u = unit.toUpperCase();
  if (u === 'SF' || u === 'SQFT' || u === 'SQF') {
    if (ceilingArea > 0) return ceilingArea;
    return totalLength * heightFt;
  }
  if (u === 'LF') return totalLength;
  if (u === 'EA' || u === 'HR') return 1;
  if (ceilingArea > 0) return ceilingArea;
  return totalLength * heightFt;
};

const getMatUnitCost = (mat: MatchedMaterial): number => mat.unit_cost ?? 0;
const getLabUnitCost = (lab: MatchedLabor): number => lab.unit_cost ?? 0;

export const MatLabView = ({
  materialCostingData,
  filterStorageKey = 'project-report:matlab',
}: MatLabViewProps) => {
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

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const baseData = useMemo(() => {
    const materialContributions: MatContribution[] = [];
    const laborContributions: LabContribution[] = [];
    const allLevelsSet = new Set<string>();
    const allItemsSet = new Set<string>();
    const allSectionsSet = new Set<string>();

    materialCostingData.forEach((assembly) => {
      const levelStr = (assembly as { level?: string }).level ?? 'Unknown';
      const parsedLevels = parseLevels(levelStr);
      const areas = parsedLevels.length > 0 ? parsedLevels : ['Unknown'];
      parsedLevels.forEach((level) => allLevelsSet.add(level));

      (assembly.materials_costing ?? []).forEach((costingItem) => {
        const { extracted_material, matched_materials, matched_labor } = costingItem;

        matched_materials.forEach((mat: MatchedMaterial) => {
          const quantity =
            mat.quantity != null && typeof mat.quantity === 'number'
              ? mat.quantity
              : getQuantityFromExtracted(extracted_material, mat.unit);
          const unitCost = getMatUnitCost(mat);
          materialContributions.push({
            code: mat.code,
            item: mat.description,
            section: mat.section ?? '—',
            quantity,
            unit: mat.unit,
            unitCost,
            totalCost: quantity * unitCost,
            areas,
          });
          allItemsSet.add(mat.description);
          if (mat.section) allSectionsSet.add(mat.section);
        });

        (matched_labor ?? []).forEach((lab: MatchedLabor) => {
          const quantity =
            lab.quantity != null && typeof lab.quantity === 'number'
              ? lab.quantity
              : getQuantityFromExtracted(extracted_material, lab.unit);
          const unitCost = getLabUnitCost(lab);
          laborContributions.push({
            code: lab.code,
            item: lab.description,
            section: lab.section ?? '—',
            quantity,
            unit: lab.unit === 'EA' ? 'Hrs' : lab.unit,
            unitCost,
            totalCost: quantity * unitCost,
            areas,
          });
          allItemsSet.add(lab.description);
        });
      });
    });

    return {
      materialContributions,
      laborContributions,
      availableItems: Array.from(allItemsSet).filter(Boolean).sort(),
      availableLevels: sortLevels(Array.from(allLevelsSet).filter((level) => level && level !== 'Unknown')),
      availableSections: Array.from(allSectionsSet).filter(Boolean).sort(),
      availableCostCodes: Array.from(allSectionsSet).filter(Boolean).sort(),
    };
  }, [materialCostingData]);

  const { groups, totalCost, availableItems, availableLevels, availableSections, availableCostCodes } =
    useMemo(() => {
      const filteredMaterials = baseData.materialContributions.filter((material) => {
        if (
          filterState.selectedLevels.size > 0 &&
          !material.areas.some((area) => filterState.selectedLevels.has(area))
        ) {
          return false;
        }
        if (
          filterState.selectedItems.size > 0 &&
          !filterState.selectedItems.has(material.item)
        ) {
          return false;
        }
        if (
          filterState.selectedSections.size > 0 &&
          !filterState.selectedSections.has(material.section)
        ) {
          return false;
        }
        if (
          filterState.selectedCostCodes.size > 0 &&
          !filterState.selectedCostCodes.has(material.section)
        ) {
          return false;
        }
        return true;
      });

      const filteredLabor = baseData.laborContributions.filter((labor) => {
        if (
          filterState.selectedLevels.size > 0 &&
          !labor.areas.some((area) => filterState.selectedLevels.has(area))
        ) {
          return false;
        }
        return true;
      });

      const matMap = new Map<string, MatContribution & { areasSet: Set<string> }>();
      filteredMaterials.forEach((material) => {
        const key = `${material.code}|${material.item}|${material.unit}`;
        if (matMap.has(key)) {
          const existing = matMap.get(key)!;
          existing.quantity += material.quantity;
          existing.totalCost += material.totalCost;
          material.areas.forEach((area) => existing.areasSet.add(area));
        } else {
          matMap.set(key, { ...material, areasSet: new Set(material.areas) });
        }
      });

      const labBySectionMap = new Map<string, Map<string, LabContribution & { areasSet: Set<string> }>>();
      filteredLabor.forEach((labor) => {
        if (!labBySectionMap.has(labor.section)) {
          labBySectionMap.set(labor.section, new Map());
        }
        const sectionMap = labBySectionMap.get(labor.section)!;
        const key = `${labor.code}|${labor.item}|${labor.unit}`;
        if (sectionMap.has(key)) {
          const existing = sectionMap.get(key)!;
          existing.quantity += labor.quantity;
          existing.totalCost += labor.totalCost;
          labor.areas.forEach((area) => existing.areasSet.add(area));
        } else {
          sectionMap.set(key, { ...labor, areasSet: new Set(labor.areas) });
        }
      });

      // ─── Debug verification ──────────────────────────────────────────────────
      if (LOG_DEBUG) {
        const aggMatRows = Array.from(matMap.values()).map((m) => ({
          code: m.code, item: m.item, section: m.section, unit: m.unit,
          qty: m.quantity, unitCost: m.unitCost, total: m.totalCost,
        }));
        const aggLabRows = Array.from(labBySectionMap.entries()).flatMap(([section, smap]) =>
          Array.from(smap.values()).map((l) => ({
            code: l.code, item: l.item, section, unit: l.unit,
            qty: l.quantity, unitCost: l.unitCost, total: l.totalCost,
          }))
        );
        const rawMatCount = filteredMaterials.length;
        const rawLabCount = filteredLabor.length;
        const rawMatTotal = filteredMaterials.reduce((sum, row) => sum + row.totalCost, 0);
        const rawLabTotal = filteredLabor.reduce((sum, row) => sum + row.totalCost, 0);
        const aggMatTotal = aggMatRows.reduce((s, r) => s + r.total, 0);
        const aggLabTotal = aggLabRows.reduce((s, r) => s + r.total, 0);

        console.group('[MatLab Debug] Raw JSON vs Aggregated');
        console.log(`Raw entries  → Materials: ${rawMatCount} rows, Total: $${rawMatTotal.toFixed(2)}`);
        console.log(`Raw entries  → Labor:     ${rawLabCount} rows, Total: $${rawLabTotal.toFixed(2)}`);
        console.log(`Aggregated   → Materials: ${aggMatRows.length} unique, Total: $${aggMatTotal.toFixed(2)}`);
        console.log(`Aggregated   → Labor:     ${aggLabRows.length} unique, Total: $${aggLabTotal.toFixed(2)}`);
        console.log('─── Aggregated Material rows (displayed) ───');
        console.table(aggMatRows.sort((a, b) => a.code.localeCompare(b.code)));
        console.log('─── Aggregated Labor rows (displayed) ───');
        console.table(aggLabRows.sort((a, b) => a.code.localeCompare(b.code)));
        console.groupEnd();
      }
      // ────────────────────────────────────────────────────────────────────────

      // Step 3: build display groups — each unique material + its section's labor
      let allGroups: AggregatedMaterialGroup[] = Array.from(matMap.entries()).map(
        ([matKey, mat]) => {
          const labForSection = labBySectionMap.get(mat.section);
          const labor: AggregatedLaborRow[] = labForSection
            ? Array.from(labForSection.entries()).map(([labKey, lab]) => ({
                labKey,
                code: lab.code,
                item: lab.item,
                section: lab.section,
                quantity: lab.quantity,
                unit: lab.unit,
                unitCost: lab.unitCost,
                totalCost: lab.totalCost,
                areas: sortLevels(Array.from(lab.areasSet).filter((a) => a !== 'Unknown')),
              }))
            : [];

          return {
            matKey,
            code: mat.code,
            item: mat.item,
            section: mat.section,
            quantity: mat.quantity,
            unit: mat.unit,
            unitCost: mat.unitCost,
            totalCost: mat.totalCost,
            areas: sortLevels(Array.from(mat.areasSet).filter((a) => a !== 'Unknown')),
            labor,
          };
        }
      );

      // Step 4: apply item/section/cost-code filters
      if (filterState.selectedItems.size > 0) {
        allGroups = allGroups.filter((g) => filterState.selectedItems.has(g.item));
      }
      if (filterState.selectedSections.size > 0) {
        allGroups = allGroups.filter((g) => filterState.selectedSections.has(g.section));
      }
      if (filterState.selectedCostCodes.size > 0) {
        allGroups = allGroups.filter((g) => filterState.selectedCostCodes.has(g.section));
      }

      const filteredTotal = allGroups.reduce(
        (s, g) =>
          s +
          g.totalCost +
          g.labor.reduce((ls, l) => ls + l.totalCost, 0),
        0
      );

      return {
        groups: allGroups,
        totalCost: filteredTotal,
        availableItems: baseData.availableItems,
        availableLevels: baseData.availableLevels,
        availableSections: baseData.availableSections,
        availableCostCodes: baseData.availableCostCodes,
      };
    }, [baseData, filterState]);

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

  const allGroupKeys = useMemo(() => groups.map((g) => g.matKey), [groups]);
  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsedGroups.has(k));

  const toggleAll = useCallback(() => {
    setCollapsedGroups(allCollapsed ? new Set() : new Set(allGroupKeys));
  }, [allCollapsed, allGroupKeys]);

  const [showExport, setShowExport] = useState(false);

  const MATLAB_COLUMNS: ExportColumnDef[] = [
    { key: 'type',      label: 'Type',         defaultEnabled: true,  format: 'string' },
    { key: 'code',      label: 'Code',         defaultEnabled: true,  format: 'string' },
    { key: 'item',      label: 'Description',  defaultEnabled: true,  format: 'string' },
    { key: 'section',   label: 'Section',      defaultEnabled: true,  format: 'string' },
    { key: 'areas',     label: 'Level',        defaultEnabled: true,  format: 'string' },
    { key: 'quantity',  label: 'Qty',          defaultEnabled: true,  format: 'number',   align: 'right' },
    { key: 'unit',      label: 'UOM',          defaultEnabled: true,  format: 'string',   align: 'center' },
    { key: 'unitCost',  label: 'Unit Cost',    defaultEnabled: true,  format: 'currency', align: 'right' },
    { key: 'totalCost', label: 'Total Cost',   defaultEnabled: true,  format: 'currency', align: 'right' },
  ];

  // Flatten material + labor rows for export (material row first, then its labor children)
  const exportRows = useMemo<ExportRow[]>(() => {
    const rows: ExportRow[] = [];
    groups.forEach((g) => {
      rows.push({
        type:      'Material',
        code:      g.code,
        item:      g.item,
        section:   g.section,
        areas:     g.areas.join(', ') || '—',
        quantity:  g.quantity,
        unit:      g.unit,
        unitCost:  g.unitCost,
        totalCost: g.totalCost,
      });
      g.labor.forEach((lab) => {
        rows.push({
          type:      'Labor',
          code:      lab.code,
          item:      lab.item,
          section:   lab.section,
          areas:     lab.areas.join(', ') || '—',
          quantity:  lab.quantity,
          unit:      lab.unit,
          unitCost:  lab.unitCost,
          totalCost: lab.totalCost,
        });
      });
    });
    return rows;
  }, [groups]);
  const summaryRows = useMemo<ExportRow[]>(() => {
    const materialTotal = groups.reduce((sum, group) => sum + group.totalCost, 0);
    const laborTotal = groups.reduce(
      (sum, group) => sum + group.labor.reduce((laborSum, labor) => laborSum + labor.totalCost, 0),
      0,
    );

    return [
      { type: 'Summary', item: 'Material Total', totalCost: materialTotal },
      { type: 'Summary', item: 'Labor Total', totalCost: laborTotal },
      { type: 'Summary', item: 'Grand Total', totalCost },
    ];
  }, [groups, totalCost]);

  const filtersActive =
    filterState.selectedItems.size > 0 ||
    filterState.selectedLevels.size > 0 ||
    filterState.selectedSections.size > 0 ||
    filterState.selectedCostCodes.size > 0;

  // Collect extracted items that produced zero matches — shown as warnings so user can review
  const unmatchedItems = useMemo(() => {
    const items: Array<{ assemblyId: string; rawText: string }> = [];
    for (const assembly of materialCostingData) {
      const assemblyId = (assembly as { assembly_id?: string }).assembly_id ?? '?';
      for (const costingItem of assembly.materials_costing ?? []) {
        if ((costingItem.matched_materials?.length ?? 0) === 0) {
          const rawText = costingItem.extracted_material?.raw_text ?? costingItem.extracted_material?.description ?? 'Unknown item';
          items.push({ assemblyId, rawText });
        }
      }
    }
    return items;
  }, [materialCostingData]);

  const [showUnmatched, setShowUnmatched] = useState(true);

  const showLevelCol = filterState.selectedLevels.size > 0;
  const colSpan = showLevelCol ? 9 : 8;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <MaterialsFilterDropdown
            availableItems={availableItems}
            availableLevels={availableLevels}
            availableSections={availableSections}
            availableCostCodes={availableCostCodes}
            filterState={filterState}
            onFilterChange={handleFilterChange}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
            iconPosition="left"
            onClick={toggleAll}
          >
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="text-sm font-medium text-emerald-800">Total</span>
            <span className="text-base font-bold text-emerald-900">
              ${formatCurrency(totalCost)}
            </span>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={Download} onClick={() => setShowExport(true)}>
          Export
        </Button>
      </div>

      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        filename="mat-lab-export"
        sheetName="Mat+Lab"
        columns={MATLAB_COLUMNS}
        rows={exportRows}
        summaryRows={summaryRows}
        filtersActive={filtersActive}
      />

      {/* Unmatched items warning panel */}
      {unmatchedItems.length > 0 && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setShowUnmatched(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-100/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span className="text-sm font-semibold text-amber-800">
                {unmatchedItems.length} item{unmatchedItems.length !== 1 ? 's' : ''} could not be matched
              </span>
              <span className="text-xs text-amber-600">— review and assign manually</span>
            </div>
            <ChevronDown
              size={14}
              className={`text-amber-600 transition-transform ${showUnmatched ? 'rotate-180' : ''}`}
            />
          </button>
          {showUnmatched && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {unmatchedItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2">
                  <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-200 rounded px-1.5 py-0.5 mt-0.5 uppercase tracking-wide">
                    {item.assemblyId}
                  </span>
                  <span className="text-xs text-amber-900 font-medium">{item.rawText}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm bg-white m-4 rounded-xl border border-slate-200">
            No items match the selected filters. Run the pipeline to load assembly data.
          </div>
        ) : (
          <div className="m-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-slate-500">
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider w-8" />
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider">Code</th>
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider">Item / Description</th>
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider">Sect</th>
                  {showLevelCol && (
                    <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider">Level</th>
                  )}
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider text-right">Qty</th>
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider text-center">UOM</th>
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider text-right">Unit Cost</th>
                  <th className="px-3 py-3 border-b border-slate-200 font-semibold uppercase tracking-wider text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, gIdx) => {
                  const isCollapsed = collapsedGroups.has(group.matKey);
                  const hasLabor = group.labor.length > 0;

                  return (
                    <React.Fragment key={group.matKey}>
                      {gIdx > 0 && (
                        <tr>
                          <td colSpan={colSpan} className="h-px bg-slate-200" />
                        </tr>
                      )}

                      {/* Material row */}
                      <tr
                        className="bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={hasLabor ? () => toggleGroup(group.matKey) : undefined}
                      >
                        <td className="pl-3 pr-1 py-2.5 text-slate-400">
                          {hasLabor ? (
                            isCollapsed
                              ? <ChevronRight size={14} className="text-slate-400" />
                              : <ChevronDown size={14} className="text-slate-400" />
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-800">{group.code}</span>
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-cyan-100 text-cyan-700">
                              Mat.
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{group.item}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono">{group.section}</td>
                        {showLevelCol && (
                          <td className="px-3 py-2.5 text-slate-500">
                            {group.areas.length > 0 ? group.areas.join(', ') : '—'}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                          {group.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{group.unit}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">${formatCurrency(group.unitCost)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-800">${formatCurrency(group.totalCost)}</td>
                      </tr>

                      {/* Labor rows — hidden when collapsed */}
                      {!isCollapsed && group.labor.map((lab) => (
                        <tr
                          key={lab.labKey}
                          className="bg-amber-50/40 hover:bg-amber-50/70 transition-colors"
                        >
                          <td className="pl-3 pr-1 py-2" />
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-600 text-[11px]">{lab.code}</span>
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700">
                                Labor
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            <span className="flex items-center gap-1.5 pl-3">
                              <span className="text-amber-400 font-bold">›</span>
                              {lab.item}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400 font-mono">{lab.section}</td>
                          {showLevelCol && (
                            <td className="px-3 py-2 text-slate-400">
                              {lab.areas.length > 0 ? lab.areas.join(', ') : '—'}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right text-slate-600">
                            {lab.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-400">{lab.unit}</td>
                          <td className="px-3 py-2 text-right text-slate-500">${formatCurrency(lab.unitCost)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">${formatCurrency(lab.totalCost)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

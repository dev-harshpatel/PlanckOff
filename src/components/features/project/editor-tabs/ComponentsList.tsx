'use client';

import React, { useEffect, useState } from 'react';
import { AssemblyComponent, MaterialDefinition, WallAssembly } from '@/types';
import { Edit2, FunctionSquare, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, IconButton, NumberInput } from '@/components/ui';
import { MaterialCosting } from '@/types/assembly';
import type { OverrideableField } from '@/types/core/projectOverrides';
import type { ProjectOverrideMap } from '@/types/core/projectOverrides';
import {
    computeFormulaQuantities,
    hasFormulaForContext,
    type ExtractedDimensions,
} from '@/lib/utils/formulaEvaluator';
import {
    findExtractedDimsForComponent,
    getMaterialByRowCode,
    getIsLaborRow,
    getQuantityForCost,
    getRowTotalCost,
    getUnitCostForRow,
} from './assemblyComponentHelpers';

// ─── Exported type used by AssemblyEditorModal for the Local/Global dialog ───

export interface PendingMouSaveData {
    materialCode: string;
    materialName: string;
    field: Extract<OverrideableField, 'mouWall' | 'mouWallSec' | 'mouCeil' | 'mouCeilSec'>;
    fieldLabel: string;
    newValue: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ComponentsListProps {
    assembly: WallAssembly;
    materials: MaterialDefinition[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    takeoffInstances: any[];
    materialCostingData?: MaterialCosting;
    overrideMap: ProjectOverrideMap;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRowDetails: (comp: AssemblyComponent, assembly: WallAssembly, instances: any[]) => any;
    onUpdateComp: (
        assemblyId: string,
        componentId: string,
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => void;
    onDeleteComponent: (assemblyId: string, componentId: string) => void;
    onAddComponent: (assemblyId: string) => void;
    onFormulaClick: (
        comp: AssemblyComponent,
        from: 'qty' | 'seqty',
        extDims?: ExtractedDimensions,
    ) => void;
    onOpenDetail: (comp: AssemblyComponent, isNew: boolean) => void;
    onMouSavePending: (pending: PendingMouSaveData) => void;
    onRevertFormulaOverrides: (materialCode: string, fields: OverrideableField[]) => void;
    isDirty: boolean;
    isSavingAssembly: boolean;
    onSaveClick: () => void;
    onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getUnitSuffix = (u: string) => {
    if (!u) return '';
    const lower = u.toLowerCase();
    if (lower.includes('sf') || lower.includes('sq')) return 'SF';
    if (lower.includes('lf') || lower.includes('ft') || lower.includes('pcs')) return 'LF';
    return 'EA';
};

const fmtNum = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────────

export const ComponentsList = ({
    assembly,
    materials,
    takeoffInstances,
    materialCostingData,
    overrideMap,
    getRowDetails,
    onUpdateComp,
    onDeleteComponent,
    onAddComponent,
    onFormulaClick,
    onOpenDetail,
    onMouSavePending,
    onRevertFormulaOverrides,
    isDirty,
    isSavingAssembly,
    onSaveClick,
    onClose,
}: ComponentsListProps) => {
    // ── Column resize state ──
    const [colWidths, setColWidths] = useState({
        sect: 55,
        code: 90,
        itemDesc: 190,
        height: 50,
        oc: 50,
        layers: 50,
        laborCode: 90,
        waste: 45,
        qty1: 65,
        uom1: 55,
        size: 65,
        qty2: 65,
        uom2: 55,
        labQty: 65,
        labUom: 55,
        matUnitPrice: 90,
        labUnitPrice: 90,
        totalMat: 95,
        totalLab: 95,
        total: 95,
    });
    const [resizingCol, setResizingCol] = useState<string | null>(null);
    const [startX, setStartX] = useState(0);
    const [startWidth, setStartWidth] = useState(0);

    const startResize = (col: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingCol(col);
        setStartX(e.clientX);
        setStartWidth(colWidths[col as keyof typeof colWidths]);
    };

    useEffect(() => {
        if (!resizingCol) return;
        const onMouseMove = (e: MouseEvent) => {
            const diff = e.clientX - startX;
            setColWidths((prev) => ({
                ...prev,
                [resizingCol]: Math.max(30, startWidth + diff),
            }));
        };
        const onMouseUp = () => setResizingCol(null);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [resizingCol, startX, startWidth]);

    const Resizer = ({ col }: { col: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-400 z-20 group"
            onMouseDown={(e) => startResize(col, e)}
        >
            <div className="w-[1px] h-full bg-slate-200 mx-auto group-hover:bg-emerald-400" />
        </div>
    );

    // ── MOU inline editing state ──
    const [editingMouCell, setEditingMouCell] = useState<{
        compId: string;
        type: 'qty' | 'seqty';
    } | null>(null);
    const [mouInputValue, setMouInputValue] = useState('');

    const isCeilingAssembly = assembly.assemblyType === 'Ceiling';

    // ── Grand totals for footer ──
    const grandTotals = assembly.components
        .filter((c) => !c.muted)
        .reduce(
            (acc, c) => {
                const t = getRowTotalCost(c, assembly, materials, takeoffInstances, materialCostingData, getRowDetails);
                if (c.materialCode?.startsWith('LAB-')) acc.lab += t;
                else acc.mat += t;
                return acc;
            },
            { mat: 0, lab: 0 },
        );

    return (
        <>
            {/* Panel header */}
            <div className="px-4 py-2.5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800 text-sm">Assembly Components</h3>
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {assembly.components.length}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                        onAddComponent(assembly.id);
                        onOpenDetail(assembly.components[assembly.components.length - 1], true);
                    }}
                    className="shrink-0 whitespace-nowrap"
                >
                    Add Component
                </Button>
            </div>

            {/* Scrollable table */}
            <div className="flex-1 overflow-auto bg-white relative">
                <table
                    className="text-[11px] border-collapse font-sans table-fixed"
                    style={{ width: 'max-content', minWidth: '100%' }}
                >
                    <thead className="sticky top-0 z-10">
                        {/* Column group labels */}
                        <tr className="bg-slate-100 border-b border-slate-200" style={{ height: '20px' }}>
                            <th colSpan={3} className="text-center text-[9px] font-bold uppercase tracking-wider border-r border-slate-200 px-1 text-slate-500">
                                Identification
                            </th>
                            <th colSpan={4} className="text-center text-[9px] font-bold uppercase tracking-wider border-r border-slate-200 px-1 text-slate-500">
                                Specs
                            </th>
                            <th colSpan={6} className="text-center text-[9px] font-bold uppercase tracking-wider border-r border-slate-200 px-1 text-emerald-600">
                                Quantities
                            </th>
                            <th colSpan={4} className="text-center text-[9px] font-bold uppercase tracking-wider border-r border-slate-200 px-1 text-amber-600">
                                Labour
                            </th>
                            <th colSpan={3} className="text-center text-[9px] font-bold uppercase tracking-wider px-1 text-sky-600">
                                Costs
                            </th>
                            <th className="w-8 border-l border-slate-200 bg-slate-100" />
                        </tr>
                        {/* Column headers */}
                        <tr className="bg-white border-b border-slate-200 h-7 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {/* Identification */}
                            <th className="relative border-r border-slate-200 text-center px-1" style={{ width: colWidths.sect }}>
                                Sect<Resizer col="sect" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center px-1" style={{ width: colWidths.code }}>
                                Code<Resizer col="code" />
                            </th>
                            <th className="relative border-r border-slate-200 text-left pl-2" style={{ width: colWidths.itemDesc }}>
                                Item / Description<Resizer col="itemDesc" />
                            </th>

                            {/* Specs */}
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.height }}>
                                Height<Resizer col="height" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.oc }}>
                                OC<Resizer col="oc" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.layers }}>
                                Layers<Resizer col="layers" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center px-1" style={{ width: colWidths.laborCode }}>
                                Labor Code<Resizer col="laborCode" />
                            </th>

                            {/* Quantities */}
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.waste }}>
                                Wst%<Resizer col="waste" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.qty1 }}>
                                <span className="flex items-center justify-center gap-0.5">
                                    Qty 1
                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-500" />
                                </span>
                                <Resizer col="qty1" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.uom1 }}>
                                UOM1<Resizer col="uom1" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.size }}>
                                Size<Resizer col="size" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.qty2 }}>
                                <span className="flex items-center justify-center gap-0.5">
                                    Qty 2
                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-500" />
                                </span>
                                <Resizer col="qty2" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.uom2 }}>
                                UOM2<Resizer col="uom2" />
                            </th>

                            {/* Labour */}
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.labQty }}>
                                Lab. Qty<Resizer col="labQty" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.labUom }}>
                                Lab. UOM<Resizer col="labUom" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.matUnitPrice }}>
                                Mat. Unit $<Resizer col="matUnitPrice" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.labUnitPrice }}>
                                Lab. Unit $<Resizer col="labUnitPrice" />
                            </th>

                            {/* Costs */}
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.totalMat }}>
                                Tot. Mat.<Resizer col="totalMat" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center" style={{ width: colWidths.totalLab }}>
                                Tot. Lab.<Resizer col="totalLab" />
                            </th>
                            <th className="relative border-r border-slate-200 text-center font-bold text-slate-700" style={{ width: colWidths.total }}>
                                Total<Resizer col="total" />
                            </th>

                            {/* Delete (sticky) */}
                            <th className="w-8 sticky right-0 bg-white z-10 border-l border-slate-200" />
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                        {assembly.components.map((comp) => {
                            const details = getRowDetails(comp, assembly, takeoffInstances);
                            const mat = getMaterialByRowCode(comp, materials);
                            const extractedDims = findExtractedDimsForComponent(comp, materialCostingData);
                            const fq = computeFormulaQuantities(comp, mat, assembly, takeoffInstances, extractedDims);
                            const hasFormula = hasFormulaForContext(comp, mat, isCeilingAssembly);

                            const isLaborRow = !!comp.materialCode?.startsWith('LAB-');

                            // Debug source badges — not for production
                            const isMatFromNewDb = !!materialCostingData?.materials_costing?.some(
                                (item) => item.matched_materials.some((m) => m.code === comp.materialCode && m._fromNewDb),
                            );
                            const isLabFromNewDb = !!materialCostingData?.materials_costing?.some(
                                (item) => item.matched_labor.some((l) => l.code === comp.materialCode && l._fromNewDb),
                            );
                            const isFromNewDb = isMatFromNewDb || isLabFromNewDb;
                            const dbSourceLabel = isLaborRow && isLabFromNewDb ? 'LD' : !isLaborRow && isMatFromNewDb ? 'MD' : isFromNewDb ? 'AD' : null;

                            // For material rows: find associated labor from the costing group
                            const costingGroup = !isLaborRow && comp.materialCode
                                ? materialCostingData?.materials_costing.find(
                                    (item) => item.matched_materials.some((m) => m.code === comp.materialCode),
                                )
                                : undefined;
                            const associatedLabor = costingGroup?.matched_labor[0];

                            // ── Height ──
                            const heightVal =
                                comp.overrideHeight != null
                                    ? `${comp.overrideHeight}'`
                                    : comp.heightCondition?.max
                                        ? `${comp.heightCondition.max}'`
                                        : assembly.defaultHeight
                                            ? `${assembly.defaultHeight}'`
                                            : '';

                            // ── OC ──
                            let ocVal = '';
                            if (comp.ocSpacing) {
                                ocVal = comp.ocSpacing;
                            } else {
                                const ocMatch = comp.usage.match(/Vertical @ (\d+)"? OC/);
                                ocVal = ocMatch
                                    ? `${ocMatch[1]}"`
                                    : comp.usage.includes('16')
                                        ? '16"'
                                        : comp.usage.includes('24')
                                            ? '24"'
                                            : comp.usage.includes('12')
                                                ? '12"'
                                                : '';
                            }

                            // ── Layers ──
                            const isGypsumComponent =
                                comp.overrideLayers != null ||
                                comp.usage.includes('Coverage') ||
                                /gypsum|wallboard|drywall|type x/i.test(comp.materialName);
                            let layersVal = '';
                            if (isGypsumComponent) {
                                if (comp.usage.includes('2 Layer')) layersVal = '2.00';
                                else if (comp.usage.includes('Coverage')) layersVal = '1.00';
                                else if (comp.usage.includes('Tracks (Top & Bottom)')) layersVal = '2';
                                else if (comp.usage.toLowerCase().includes('track') && !comp.usage.includes('&'))
                                    layersVal = '1';
                            }

                            // ── Formula quantities ──
                            const formulaQtyValue = isCeilingAssembly ? fq.ceilQty : fq.qty;
                            const displayQty = (() => {
                                if (!hasFormula) {
                                    if (comp.usage === 'Fixed Qty') return comp.overrideQuantity ?? null;
                                    return null;
                                }
                                return formulaQtyValue;
                            })();
                            const formulaSeQtyValue = isCeilingAssembly ? fq.ceilSeQty : fq.seQty;
                            const displaySeQty = formulaSeQtyValue;

                            // ── Override indicators ──
                            const matOverrides = mat?.code ? (overrideMap[mat.code] ?? {}) : {};
                            const hasFormulaOverride = isCeilingAssembly
                                ? ('formulaCeilQty' in matOverrides || 'formulaCeilSecQty' in matOverrides)
                                : ('formulaQty' in matOverrides || 'formulaSecQty' in matOverrides);
                            const mouQtyField = isCeilingAssembly ? 'mouCeil' : 'mouWall';
                            const mouSeQtyField = isCeilingAssembly ? 'mouCeilSec' : 'mouWallSec';
                            const hasMouQtyOverride = mouQtyField in matOverrides;
                            const hasMouSeQtyOverride = mouSeQtyField in matOverrides;

                            // ── Unit cost ──
                            const unitCostDisplay = (() => {
                                const prodRate = mat?.productivity;
                                const raw = comp.overrideMatCost ?? prodRate;
                                if (raw == null) return undefined;
                                const num = typeof raw === 'number' ? raw : Number(raw);
                                return Number.isFinite(num) ? num : undefined;
                            })();
                            const unitCostPlaceholder = (() => {
                                const prodRate = mat?.productivity;
                                if (prodRate != null && typeof prodRate === 'number' && Number.isFinite(prodRate)) {
                                    return prodRate.toFixed(2);
                                }
                                const up = details.unitPrice;
                                if (up != null && typeof up === 'number' && Number.isFinite(up)) {
                                    return up.toFixed(2);
                                }
                                return '-';
                            })();

                            const rowTotal = getRowTotalCost(
                                comp, assembly, materials, takeoffInstances, materialCostingData, getRowDetails,
                            );

                            // ── Labour data ──
                            const labUnitCost = isLaborRow
                                ? (unitCostDisplay ?? 0)
                                : (associatedLabor?.unit_cost ?? 0);
                            const labQtyVal = isLaborRow
                                ? (displayQty ?? 0)
                                : (associatedLabor?.quantity ?? 0);
                            const labUomVal = isLaborRow
                                ? ((isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) ||
                                    getUnitSuffix(comp.selectedUnit || details.unit))
                                : (associatedLabor?.unit ?? '');
                            const totalLabCost = labUnitCost * labQtyVal;
                            const totalMatCost = isLaborRow ? 0 : rowTotal;

                            const handleSimpleFieldChange = <K extends keyof AssemblyComponent>(
                                field: K,
                                nextValue: AssemblyComponent[K],
                            ) => {
                                if (comp[field] === nextValue) return;
                                onUpdateComp(assembly.id, comp.id, field, nextValue);
                            };

                            const rowBg = comp.muted
                                ? 'opacity-40 bg-slate-50/80 pointer-events-none'
                                : isLaborRow
                                    ? 'bg-amber-50/20 hover:bg-amber-50/50'
                                    : isFromNewDb
                                        ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                                        : 'hover:bg-slate-50/60';

                            return (
                                <tr key={comp.id} className={`transition-colors h-7 ${rowBg}`}>

                                    {/* ── Sect ── */}
                                    <td className="border-r border-slate-200 text-center px-1 text-slate-500 text-[10px]">
                                        {comp.sectionCode || <span className="text-slate-300">—</span>}
                                    </td>

                                    {/* ── Code ── */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {comp.materialCode ? (
                                            <div className="flex flex-col items-center leading-none py-0.5">
                                                <span className="font-bold text-[10px] text-slate-700 truncate max-w-full">
                                                    {comp.materialCode}
                                                </span>
                                                <span className={`text-[8px] uppercase font-semibold mt-px ${isLaborRow ? 'text-amber-600' : 'text-cyan-600'}`}>
                                                    {isLaborRow ? 'Labor' : 'Mat.'}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Item / Description ── */}
                                    <td className="border-r border-slate-200 relative p-0">
                                        <div
                                            className="w-full h-full px-2 flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50/50 transition-colors group/desc"
                                            onClick={() => onOpenDetail(comp, false)}
                                        >
                                            <span className="truncate text-slate-700">{comp.materialName}</span>
                                            {dbSourceLabel && (
                                                <span className={`shrink-0 text-[8px] font-bold uppercase tracking-wide rounded px-1 py-0.5 leading-none ${
                                                    dbSourceLabel === 'MD'
                                                        ? 'text-emerald-700 bg-emerald-100 border border-emerald-300'
                                                        : dbSourceLabel === 'LD'
                                                            ? 'text-amber-700 bg-amber-100 border border-amber-300'
                                                            : 'text-purple-700 bg-purple-100 border border-purple-300'
                                                }`}>
                                                    {dbSourceLabel}
                                                </span>
                                            )}
                                            <Settings2 className="w-3 h-3 text-slate-300 shrink-0 ml-auto opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                                        </div>
                                    </td>

                                    {/* ── Height ── */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isLaborRow ? (
                                            <span className="block w-full text-center text-[10px] text-slate-400 px-1 select-none">
                                                {heightVal || '—'}
                                            </span>
                                        ) : (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none text-[11px]"
                                                value={comp.overrideHeight}
                                                onChange={(val) => handleSimpleFieldChange('overrideHeight', val)}
                                                placeholder={heightVal}
                                            />
                                        )}
                                    </td>

                                    {/* ── OC ── */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {comp.usage.includes('Vertical') ? (
                                            <input
                                                className="w-full h-full bg-transparent text-center outline-none text-[11px]"
                                                value={ocVal.replace('"', '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!/^\d*$/.test(val)) return;
                                                    onUpdateComp(assembly.id, comp.id, 'usage', `Vertical @ ${val}" OC`);
                                                    onUpdateComp(assembly.id, comp.id, 'ocSpacing', val ? `${val}"` : undefined);
                                                }}
                                            />
                                        ) : (
                                            <span className="text-slate-400">{ocVal || '—'}</span>
                                        )}
                                    </td>

                                    {/* ── Layers ── */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isGypsumComponent ? (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none text-[11px]"
                                                value={comp.overrideLayers}
                                                onChange={(val) => handleSimpleFieldChange('overrideLayers', val)}
                                                placeholder={layersVal}
                                                type="float"
                                            />
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Labor Code ── */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {isLaborRow ? (
                                            <span className="text-[10px] font-semibold text-amber-700 truncate block text-center">
                                                {comp.materialCode}
                                            </span>
                                        ) : mat?.laborCostCode ? (
                                            <span className="text-[10px] font-medium text-slate-600 truncate block text-center">
                                                {mat.laborCostCode}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Wst% ── */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        <NumberInput
                                            cellMode
                                            className="w-full h-full bg-transparent text-center outline-none text-[11px]"
                                            value={comp.wasteFactor}
                                            onChange={(val) => handleSimpleFieldChange('wasteFactor', val)}
                                            placeholder="5"
                                            scale={0.01}
                                        />
                                    </td>

                                    {/* ── Qty 1 ── */}
                                    <td
                                        className={[
                                            'border-r border-slate-200 text-center p-0',
                                            hasFormula ? 'cursor-pointer group' : '',
                                        ].join(' ')}
                                        onClick={hasFormula ? () => onFormulaClick(comp, 'qty', extractedDims) : undefined}
                                        title={hasFormula ? 'Click to edit formula' : undefined}
                                    >
                                        {comp.usage === 'Fixed Qty' && !hasFormula ? (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none font-semibold text-[11px]"
                                                value={comp.overrideQuantity}
                                                onChange={(val) => handleSimpleFieldChange('overrideQuantity', val)}
                                                placeholder={displayQty != null ? displayQty.toFixed(2) : '0.00'}
                                            />
                                        ) : (
                                            <div className={[
                                                'flex items-center justify-center gap-0.5 h-full px-1 relative',
                                                hasFormula ? 'hover:bg-emerald-50 transition-colors rounded' : '',
                                            ].join(' ')}>
                                                <span className={`tabular-nums ${hasFormula ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>
                                                    {displayQty != null ? displayQty.toFixed(2) : '—'}
                                                </span>
                                                {hasFormula && (
                                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                                {hasFormulaOverride && mat?.code && (
                                                    <button
                                                        type="button"
                                                        className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-orange-400 hover:bg-orange-500"
                                                        title="Formula overridden — click to revert"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRevertFormulaOverrides(
                                                                mat.code,
                                                                isCeilingAssembly
                                                                    ? ['formulaCeilQty', 'formulaCeilSecQty']
                                                                    : ['formulaQty', 'formulaSecQty'],
                                                            );
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* ── UOM1 ── */}
                                    <td
                                        className="border-r border-slate-200 text-center px-1 relative group/mou"
                                        title={mat?.code ? 'Click to edit UOM' : undefined}
                                    >
                                        {displayQty != null || hasFormula ? (
                                            editingMouCell?.compId === comp.id && editingMouCell.type === 'qty' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full text-center text-[10px] border border-emerald-400 rounded outline-none px-1"
                                                    value={mouInputValue}
                                                    onChange={(e) => setMouInputValue(e.target.value)}
                                                    onBlur={() => {
                                                        const original = (isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) || '';
                                                        if (mouInputValue.trim() && mouInputValue.trim() !== original && mat?.code) {
                                                            onMouSavePending({
                                                                materialCode: mat.code,
                                                                materialName: mat.description || mat.code,
                                                                field: isCeilingAssembly ? 'mouCeil' : 'mouWall',
                                                                fieldLabel: 'UOM1',
                                                                newValue: mouInputValue.trim(),
                                                            });
                                                        }
                                                        setEditingMouCell(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                        if (e.key === 'Escape') setEditingMouCell(null);
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                    onClick={() => {
                                                        if (!mat?.code) return;
                                                        const val = (isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) ||
                                                            getUnitSuffix(comp.selectedUnit || details.unit);
                                                        setMouInputValue(val);
                                                        setEditingMouCell({ compId: comp.id, type: 'qty' });
                                                    }}
                                                >
                                                    <span className="text-[10px] font-medium text-slate-600">
                                                        {(isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) ||
                                                            getUnitSuffix(comp.selectedUnit || details.unit)}
                                                    </span>
                                                    {mat?.code && (
                                                        <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou:opacity-100" />
                                                    )}
                                                    {hasMouQtyOverride && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" title="UOM overridden" />
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Size ── */}
                                    <td className="border-r border-slate-200 text-center px-1 text-[10px] text-slate-500">
                                        {mat?.size || <span className="text-slate-300">—</span>}
                                    </td>

                                    {/* ── Qty 2 ── */}
                                    <td
                                        className={[
                                            'border-r border-slate-200 text-center px-1',
                                            hasFormula ? 'cursor-pointer group' : '',
                                        ].join(' ')}
                                        onClick={hasFormula ? () => onFormulaClick(comp, 'seqty', extractedDims) : undefined}
                                        title={hasFormula ? 'Click to edit formula' : undefined}
                                    >
                                        <div className={[
                                            'flex items-center justify-center gap-0.5 h-full px-0.5',
                                            hasFormula ? 'hover:bg-emerald-50 transition-colors rounded' : '',
                                        ].join(' ')}>
                                            <span className={`tabular-nums ${hasFormula ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                                                {displaySeQty != null ? displaySeQty.toFixed(2) : '—'}
                                            </span>
                                            {hasFormula && (
                                                <FunctionSquare className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </td>

                                    {/* ── UOM2 ── */}
                                    <td
                                        className="border-r border-slate-200 text-center px-1 relative group/mou2"
                                        title={mat?.code ? 'Click to edit UOM2' : undefined}
                                    >
                                        {displaySeQty != null ? (
                                            editingMouCell?.compId === comp.id && editingMouCell.type === 'seqty' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full text-center text-[10px] border border-emerald-400 rounded outline-none px-1"
                                                    value={mouInputValue}
                                                    onChange={(e) => setMouInputValue(e.target.value)}
                                                    onBlur={() => {
                                                        const original = (isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) || '';
                                                        if (mouInputValue.trim() && mouInputValue.trim() !== original && mat?.code) {
                                                            onMouSavePending({
                                                                materialCode: mat.code,
                                                                materialName: mat.description || mat.code,
                                                                field: isCeilingAssembly ? 'mouCeilSec' : 'mouWallSec',
                                                                fieldLabel: 'UOM2',
                                                                newValue: mouInputValue.trim(),
                                                            });
                                                        }
                                                        setEditingMouCell(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                        if (e.key === 'Escape') setEditingMouCell(null);
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                    onClick={() => {
                                                        if (!mat?.code) return;
                                                        const altU = details.altUnits || {};
                                                        const mouFallback = altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '-';
                                                        const val = (isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) || mouFallback;
                                                        setMouInputValue(val);
                                                        setEditingMouCell({ compId: comp.id, type: 'seqty' });
                                                    }}
                                                >
                                                    <span className="text-[10px] font-medium text-slate-600">
                                                        {(isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) ||
                                                            (() => {
                                                                const altU = details.altUnits || {};
                                                                return altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '-';
                                                            })()}
                                                    </span>
                                                    {mat?.code && (
                                                        <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou2:opacity-100" />
                                                    )}
                                                    {hasMouSeQtyOverride && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" title="UOM2 overridden" />
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Labour Qty ── */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {labQtyVal > 0 ? (
                                            <span className="tabular-nums font-medium text-amber-700">
                                                {labQtyVal.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Labour UOM ── */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {labUomVal ? (
                                            <span className="text-[10px] font-medium text-amber-700">{labUomVal}</span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Mat. Unit Price ── */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isLaborRow ? (
                                            <span className="block text-center text-slate-300 px-2">—</span>
                                        ) : (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none font-medium text-[11px]"
                                                value={unitCostDisplay}
                                                onChange={(val) => onUpdateComp(assembly.id, comp.id, 'overrideMatCost', val)}
                                                placeholder={unitCostPlaceholder}
                                            />
                                        )}
                                    </td>

                                    {/* ── Lab. Unit Price ── */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isLaborRow ? (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none font-medium text-[11px] text-amber-700"
                                                value={unitCostDisplay}
                                                onChange={(val) => onUpdateComp(assembly.id, comp.id, 'overrideMatCost', val)}
                                                placeholder={unitCostPlaceholder}
                                            />
                                        ) : labUnitCost > 0 ? (
                                            <span className="block text-center tabular-nums font-medium text-amber-700 px-2">
                                                {labUnitCost.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="block text-center text-slate-300 px-2">—</span>
                                        )}
                                    </td>

                                    {/* ── Total Mat. Cost ── */}
                                    <td className="border-r border-slate-200 text-right px-2">
                                        {!isLaborRow && Number.isFinite(totalMatCost) && totalMatCost > 0 ? (
                                            <span className="tabular-nums font-medium text-slate-700">
                                                {fmtNum(totalMatCost)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Total Lab. Cost ── */}
                                    <td className="border-r border-slate-200 text-right px-2">
                                        {Number.isFinite(totalLabCost) && totalLabCost > 0 ? (
                                            <span className="tabular-nums font-medium text-amber-700">
                                                {fmtNum(totalLabCost)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Total Cost ── */}
                                    <td className="border-r border-slate-200 text-right px-2 bg-slate-50">
                                        {Number.isFinite(rowTotal) && rowTotal > 0 ? (
                                            <span className="tabular-nums font-bold text-slate-800">
                                                {fmtNum(rowTotal)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* ── Delete (sticky) ── */}
                                    <td className="text-center sticky right-0 bg-white border-l border-slate-200">
                                        <IconButton
                                            icon={Trash2}
                                            variant="danger"
                                            size="sm"
                                            onClick={() => onDeleteComponent(assembly.id, comp.id)}
                                            tooltip="Delete component"
                                        />
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Footer totals row */}
                        <tr className="bg-slate-50 border-t border-slate-200 h-8 text-[11px]">
                            <td colSpan={18} className="px-4 text-right text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                Assembly Total
                            </td>
                            <td className="text-right px-2 tabular-nums font-semibold text-slate-700">
                                {fmtNum(grandTotals.mat)}
                            </td>
                            <td className="text-right px-2 tabular-nums font-semibold text-amber-700">
                                {fmtNum(grandTotals.lab)}
                            </td>
                            <td className="text-right px-2 tabular-nums font-bold text-slate-900 bg-white">
                                {fmtNum(grandTotals.mat + grandTotals.lab)}
                            </td>
                            <td className="sticky right-0 bg-slate-50 border-l border-slate-200" />
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Save / Close footer */}
            <div className="bg-white border-t border-slate-200 px-4 py-2.5 flex justify-end items-center gap-2 shrink-0">
                {isDirty && (
                    <Button
                        variant="primary"
                        size="sm"
                        isLoading={isSavingAssembly}
                        onClick={onSaveClick}
                    >
                        Save Changes
                    </Button>
                )}
                <Button
                    variant={isDirty ? 'ghost' : 'primary'}
                    size="sm"
                    onClick={onClose}
                >
                    {isDirty ? 'Close without saving' : 'Close'}
                </Button>
            </div>
        </>
    );
};

// Re-export helpers so AssemblyEditorModal can compute totals without
// duplicating the logic.
export { getMaterialByRowCode, getIsLaborRow, getRowTotalCost, getUnitCostForRow, getQuantityForCost };

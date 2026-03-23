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

// ─── Column resize helper ─────────────────────────────────────────────────────

const getUnitSuffix = (u: string) => {
    if (!u) return '';
    const lower = u.toLowerCase();
    if (lower.includes('sf') || lower.includes('sq')) return 'SF';
    if (lower.includes('lf') || lower.includes('ft') || lower.includes('pcs')) return 'LF';
    return 'EA';
};

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
        index: 30,
        sect: 72,
        desc: 360,
        lab: 90,
        height: 50,
        oc: 60,
        layers: 50,
        waste: 40,
        qty: 60,
        seQty: 65,
        uom: 60,
        mou: 80,
        matCost: 90,
        total: 110,
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
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20 group"
            onMouseDown={(e) => startResize(col, e)}
        >
            <div className="w-[1px] h-full bg-slate-300 mx-auto group-hover:bg-blue-400" />
        </div>
    );

    // ── MOU inline editing state ──
    const [editingMouCell, setEditingMouCell] = useState<{
        compId: string;
        type: 'qty' | 'seqty';
    } | null>(null);
    const [mouInputValue, setMouInputValue] = useState('');

    const isCeilingAssembly = assembly.assemblyType === 'Ceiling';

    return (
        <>
            {/* Panel header */}
            <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0 gap-4">
                <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">
                    Assembly Components
                </h3>
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
            <div className="flex-1 overflow-auto p-0 bg-white relative">
                <table
                    className="min-w-full text-[11px] border-collapse font-sans table-fixed"
                    style={{ width: 'max-content' }}
                >
                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm border-b border-slate-300 h-8">
                        <tr>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.index }}>
                                #<Resizer col="index" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.lab }}>
                                Code<Resizer col="lab" />
                            </th>
                            <th className="relative border-r border-slate-300 text-left pl-2" style={{ width: colWidths.desc }}>
                                Item / Description<Resizer col="desc" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center px-1 whitespace-nowrap" style={{ width: colWidths.sect }}>
                                Sect<Resizer col="sect" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.height }}>
                                Hgt<Resizer col="height" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center px-1" style={{ width: colWidths.oc }}>
                                OC<Resizer col="oc" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.layers }}>
                                Layering<Resizer col="layers" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.waste }}>
                                Wst%<Resizer col="waste" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.qty }}>
                                <span className="flex items-center justify-center gap-1">
                                    Qty
                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-500 opacity-70" />
                                </span>
                                <Resizer col="qty" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.uom }}>
                                UOM<Resizer col="uom" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.seQty }}>
                                <span className="flex items-center justify-center gap-1">
                                    Se.Qty
                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-500 opacity-70" />
                                </span>
                                <Resizer col="seQty" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.mou }}>
                                UOM<Resizer col="mou" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.matCost }}>
                                Unit Cost<Resizer col="matCost" />
                            </th>
                            <th className="relative border-r border-slate-300 text-center font-bold" style={{ width: colWidths.total }}>
                                Total Cost<Resizer col="total" />
                            </th>
                            <th className="w-8 sticky right-0 bg-slate-100 z-10 border-l border-slate-300" />
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                        {assembly.components.map((comp, idx) => {
                            const details = getRowDetails(comp, assembly, takeoffInstances);
                            const mat = getMaterialByRowCode(comp, materials);
                            const extractedDims = findExtractedDimsForComponent(comp, materialCostingData);
                            const fq = computeFormulaQuantities(comp, mat, assembly, takeoffInstances, extractedDims);
                            const hasFormula = hasFormulaForContext(comp, mat, isCeilingAssembly);

                            const section = comp.sectionCode || '';
                            const isLaborRow = !!comp.materialCode?.startsWith('LAB-');

                            // Hgt display
                            const heightVal =
                                comp.overrideHeight != null
                                    ? `${comp.overrideHeight}'`
                                    : comp.heightCondition?.max
                                        ? `${comp.heightCondition.max}'`
                                        : assembly.defaultHeight
                                            ? `${assembly.defaultHeight}'`
                                            : '';

                            // OC display
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

                            // Layering display
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

                            // Formula-derived qty / seQty
                            const formulaQtyValue = isCeilingAssembly ? fq.ceilQty : fq.qty;
                            /**
                             * Qty display rules:
                             * - If there is a formula for this context → show the formula result only.
                             * - If usage is "Fixed Qty" with no formula → show the editable overrideQuantity.
                             * - Otherwise (no formula + not fixed) → show "—" instead of any fallback quantity
                             *   coming from imported data (e.g. final_output JSON).
                             */
                            const displayQty = (() => {
                                if (!hasFormula) {
                                    if (comp.usage === 'Fixed Qty') {
                                        return comp.overrideQuantity ?? null;
                                    }
                                    return null;
                                }
                                return formulaQtyValue;
                            })();
                            const formulaSeQtyValue = isCeilingAssembly ? fq.ceilSeQty : fq.seQty;
                            const displaySeQty = formulaSeQtyValue;
                            const altU = details.altUnits || {};
                            const mouVal = altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '-';

                            // Override indicators
                            const matOverrides = mat?.code ? (overrideMap[mat.code] ?? {}) : {};
                            const hasFormulaOverride = isCeilingAssembly
                                ? ('formulaCeilQty' in matOverrides || 'formulaCeilSecQty' in matOverrides)
                                : ('formulaQty' in matOverrides || 'formulaSecQty' in matOverrides);
                            const mouQtyField = isCeilingAssembly ? 'mouCeil' : 'mouWall';
                            const mouSeQtyField = isCeilingAssembly ? 'mouCeilSec' : 'mouWallSec';
                            const hasMouQtyOverride = mouQtyField in matOverrides;
                            const hasMouSeQtyOverride = mouSeQtyField in matOverrides;

                            // Cost cell data — guard against NaN propagating from DB null values
                            // Uses Number() to catch both number NaN and string "NaN" (PostgreSQL NaN via Supabase)
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

                            const handleSimpleFieldChange = <K extends keyof AssemblyComponent>(
                                field: K,
                                nextValue: AssemblyComponent[K],
                            ) => {
                                const prevValue = comp[field];
                                if (prevValue === nextValue) return;
                                onUpdateComp(assembly.id, comp.id, field, nextValue);
                            };

                            // Code cell
                            const CodeCell = () => {
                                if (comp.materialCode) {
                                    const isLabor = comp.materialCode.startsWith('LAB-');
                                    return (
                                        <div className="flex flex-col items-center leading-none py-0.5">
                                            <span className="font-bold text-[10px] text-slate-700">
                                                {comp.materialCode}
                                            </span>
                                            <span className={`text-[8px] uppercase font-bold ${isLabor ? 'text-amber-600' : 'text-cyan-600'}`}>
                                                {isLabor ? 'Labor' : 'Mat.'}
                                            </span>
                                        </div>
                                    );
                                }
                                const m = materials.find((m) => m.description === comp.materialName);
                                if (!m) return <span className="text-slate-300">-</span>;
                                return (
                                    <div className="flex flex-col items-center leading-none py-0.5">
                                        <span className="font-bold text-[10px] text-slate-700">{m.code}</span>
                                        <span className={`text-[8px] uppercase font-bold ${m.category === 'Labor' ? 'text-amber-600' : 'text-cyan-600'}`}>
                                            {m.category === 'Labor' ? 'Labor' : 'Mat.'}
                                        </span>
                                    </div>
                                );
                            };

                            return (
                                <tr
                                    key={comp.id}
                                    className={`transition-colors h-7 cursor-pointer ${
                                        comp.muted
                                            ? "opacity-40 bg-slate-50/80 pointer-events-none"
                                            : "hover:bg-blue-50/20"
                                    }`}
                                >
                                    <td className="border-r border-slate-200 text-center bg-slate-50 text-[10px]">
                                        {comp.muted ? (
                                            <span className="text-slate-300 italic">-</span>
                                        ) : (
                                            idx + 1
                                        )}
                                    </td>

                                    {/* Code */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        <CodeCell />
                                    </td>

                                    {/* Description */}
                                    <td className="border-r border-slate-200 relative p-0">
                                        <div
                                            className="w-full h-full px-2 flex items-center cursor-pointer hover:bg-emerald-50/40 transition-colors group/desc"
                                            onClick={() => onOpenDetail(comp, false)}
                                        >
                                            <span className="truncate">{comp.materialName}</span>
                                            <Settings2 className="w-3 h-3 text-slate-300 shrink-0 ml-1 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                                        </div>
                                    </td>

                                    <td className="border-r border-slate-200 text-center text-slate-500 px-1 whitespace-nowrap">
                                        {section}
                                    </td>

                                    {/* Hgt */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isLaborRow ? (
                                            <span className="block w-full text-center text-xs text-slate-400 px-1 py-1.5 select-none" title="Labor height is derived from material height">
                                                {heightVal || '—'}
                                            </span>
                                        ) : (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none"
                                                value={comp.overrideHeight}
                                                onChange={(val) =>
                                                    handleSimpleFieldChange('overrideHeight', val)
                                                }
                                                placeholder={heightVal}
                                            />
                                        )}
                                    </td>

                                    {/* OC */}
                                    <td className="border-r border-slate-200 text-center px-1">
                                        {comp.usage.includes('Vertical') ? (
                                            <input
                                                className="w-full h-full bg-transparent text-center outline-none"
                                                value={ocVal.replace('"', '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!/^\d*$/.test(val)) return;
                                                    onUpdateComp(assembly.id, comp.id, 'usage', `Vertical @ ${val}" OC`);
                                                    onUpdateComp(assembly.id, comp.id, 'ocSpacing', val ? `${val}"` : undefined);
                                                }}
                                            />
                                        ) : (
                                            ocVal
                                        )}
                                    </td>

                                    {/* Layering */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        {isGypsumComponent ? (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none"
                                                value={comp.overrideLayers}
                                                onChange={(val) =>
                                                    handleSimpleFieldChange('overrideLayers', val)
                                                }
                                                placeholder={layersVal}
                                                type="float"
                                            />
                                        ) : (
                                            <span className="text-slate-400">-</span>
                                        )}
                                    </td>

                                    {/* Waste Factor */}
                                    <td className="border-r border-slate-200 text-center p-0">
                                        <NumberInput
                                            cellMode
                                            className="w-full h-full bg-transparent text-center outline-none"
                                            value={comp.wasteFactor}
                                            onChange={(val) =>
                                                handleSimpleFieldChange('wasteFactor', val)
                                            }
                                            placeholder="5"
                                            scale={0.01}
                                        />
                                    </td>

                                    {/* Qty */}
                                    <td
                                        className={[
                                            'border-r border-slate-200 text-center font-bold px-1 p-0',
                                            hasFormula ? 'cursor-pointer group' : '',
                                        ].join(' ')}
                                        onClick={
                                            hasFormula
                                                ? () => onFormulaClick(comp, 'qty', extractedDims)
                                                : undefined
                                        }
                                        title={hasFormula ? 'Click to edit formula' : undefined}
                                    >
                                        {comp.usage === 'Fixed Qty' && !hasFormula ? (
                                            <NumberInput
                                                cellMode
                                                className="w-full h-full bg-transparent text-center outline-none font-bold"
                                                value={comp.overrideQuantity}
                                                onChange={(val) =>
                                                    handleSimpleFieldChange('overrideQuantity', val)
                                                }
                                                placeholder={
                                                    displayQty != null ? displayQty.toFixed(2) : '0.00'
                                                }
                                            />
                                        ) : (
                                            <div
                                                className={[
                                                    'flex items-center justify-center gap-0.5 h-full px-1 relative',
                                                    hasFormula
                                                        ? 'hover:bg-emerald-50 transition-colors rounded'
                                                        : '',
                                                ].join(' ')}
                                            >
                                                <span className={hasFormula ? 'text-emerald-700' : ''}>
                                                    {displayQty != null ? displayQty.toFixed(2) : '—'}
                                                </span>
                                                {hasFormula && (
                                                    <FunctionSquare className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                                {hasFormulaOverride && mat?.code && (
                                                    <button
                                                        type="button"
                                                        className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-orange-400 hover:bg-orange-500 cursor-pointer"
                                                        title="Formula overridden for this project — click to revert"
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

                                    {/* UOM (Qty MOU) */}
                                    <td
                                        className="border-r border-slate-200 text-center px-1 font-medium relative group/mou"
                                        title={mat?.code ? 'Click to edit UOM' : undefined}
                                    >
                                        {displayQty != null || hasFormula ? (
                                            editingMouCell?.compId === comp.id &&
                                            editingMouCell.type === 'qty' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full text-center text-xs border border-emerald-400 rounded outline-none px-1"
                                                    value={mouInputValue}
                                                    onChange={(e) => setMouInputValue(e.target.value)}
                                                    onBlur={() => {
                                                        const original =
                                                            (isCeilingAssembly
                                                                ? mat?.mouCeil
                                                                : mat?.mouWall) || '';
                                                        if (
                                                            mouInputValue.trim() &&
                                                            mouInputValue.trim() !== original &&
                                                            mat?.code
                                                        ) {
                                                            onMouSavePending({
                                                                materialCode: mat.code,
                                                                materialName: mat.description || mat.code,
                                                                field: isCeilingAssembly
                                                                    ? 'mouCeil'
                                                                    : 'mouWall',
                                                                fieldLabel: 'UOM (Qty)',
                                                                newValue: mouInputValue.trim(),
                                                            });
                                                        }
                                                        setEditingMouCell(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter')
                                                            (e.target as HTMLInputElement).blur();
                                                        if (e.key === 'Escape') setEditingMouCell(null);
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                    onClick={() => {
                                                        if (!mat?.code) return;
                                                        const val =
                                                            (isCeilingAssembly
                                                                ? mat?.mouCeil
                                                                : mat?.mouWall) ||
                                                            getUnitSuffix(
                                                                comp.selectedUnit || details.unit,
                                                            );
                                                        setMouInputValue(val);
                                                        setEditingMouCell({
                                                            compId: comp.id,
                                                            type: 'qty',
                                                        });
                                                    }}
                                                >
                                                    <span>
                                                        {(isCeilingAssembly
                                                            ? mat?.mouCeil
                                                            : mat?.mouWall) ||
                                                            getUnitSuffix(
                                                                comp.selectedUnit || details.unit,
                                                            )}
                                                    </span>
                                                    {mat?.code && (
                                                        <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou:opacity-100" />
                                                    )}
                                                    {hasMouQtyOverride && (
                                                        <span
                                                            className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"
                                                            title="UOM overridden for this project"
                                                        />
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            '-'
                                        )}
                                    </td>

                                    {/* Se.Qty */}
                                    <td
                                        className={[
                                            'border-r border-slate-200 text-center px-1',
                                            hasFormula ? 'cursor-pointer group' : 'text-slate-600',
                                        ].join(' ')}
                                        onClick={
                                            hasFormula
                                                ? () => onFormulaClick(comp, 'seqty', extractedDims)
                                                : undefined
                                        }
                                        title={hasFormula ? 'Click to edit formula' : undefined}
                                    >
                                        <div
                                            className={[
                                                'flex items-center justify-center gap-0.5 h-full px-0.5',
                                                hasFormula
                                                    ? 'hover:bg-emerald-50 transition-colors rounded'
                                                    : '',
                                            ].join(' ')}
                                        >
                                            <span
                                                className={
                                                    hasFormula
                                                        ? 'text-emerald-700 font-medium'
                                                        : 'text-slate-600'
                                                }
                                            >
                                                {displaySeQty != null
                                                    ? displaySeQty.toFixed(2)
                                                    : '-'}
                                            </span>
                                            {hasFormula && (
                                                <FunctionSquare className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </td>

                                    {/* MOU (Se.Qty MOU) */}
                                    <td
                                        className="border-r border-slate-200 text-center px-1 text-slate-600 truncate relative group/mou2"
                                        title={mat?.code ? 'Click to edit Se.Qty UOM' : undefined}
                                    >
                                        {displaySeQty != null ? (
                                            editingMouCell?.compId === comp.id &&
                                            editingMouCell.type === 'seqty' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full text-center text-xs border border-emerald-400 rounded outline-none px-1"
                                                    value={mouInputValue}
                                                    onChange={(e) => setMouInputValue(e.target.value)}
                                                    onBlur={() => {
                                                        const original =
                                                            (isCeilingAssembly
                                                                ? mat?.mouCeilSec
                                                                : mat?.mouWallSec) || '';
                                                        if (
                                                            mouInputValue.trim() &&
                                                            mouInputValue.trim() !== original &&
                                                            mat?.code
                                                        ) {
                                                            onMouSavePending({
                                                                materialCode: mat.code,
                                                                materialName: mat.description || mat.code,
                                                                field: isCeilingAssembly
                                                                    ? 'mouCeilSec'
                                                                    : 'mouWallSec',
                                                                fieldLabel: 'UOM (Se.Qty)',
                                                                newValue: mouInputValue.trim(),
                                                            });
                                                        }
                                                        setEditingMouCell(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter')
                                                            (e.target as HTMLInputElement).blur();
                                                        if (e.key === 'Escape') setEditingMouCell(null);
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                    onClick={() => {
                                                        if (!mat?.code) return;
                                                        const val =
                                                            (isCeilingAssembly
                                                                ? mat?.mouCeilSec
                                                                : mat?.mouWallSec) || mouVal;
                                                        setMouInputValue(val);
                                                        setEditingMouCell({
                                                            compId: comp.id,
                                                            type: 'seqty',
                                                        });
                                                    }}
                                                >
                                                    <span>
                                                        {(isCeilingAssembly
                                                            ? mat?.mouCeilSec
                                                            : mat?.mouWallSec) || mouVal}
                                                    </span>
                                                    {mat?.code && (
                                                        <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou2:opacity-100" />
                                                    )}
                                                    {hasMouSeQtyOverride && (
                                                        <span
                                                            className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"
                                                            title="Se.Qty UOM overridden for this project"
                                                        />
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            '-'
                                        )}
                                    </td>

                                    {/* Unit Cost */}
                                    <td className="border-r border-slate-200 text-center font-medium p-0">
                                        <NumberInput
                                            cellMode
                                            className="w-full h-full bg-transparent text-center outline-none font-medium"
                                            value={unitCostDisplay}
                                            onChange={(val) =>
                                                onUpdateComp(assembly.id, comp.id, 'overrideMatCost', val)
                                            }
                                            placeholder={unitCostPlaceholder}
                                        />
                                    </td>

                                    {/* Total Cost */}
                                    <td className="text-center font-bold bg-slate-50 text-slate-800 border-r border-slate-200">
                                        {Number.isFinite(rowTotal)
                                            ? rowTotal.toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })
                                            : '—'}
                                    </td>

                                    {/* Delete */}
                                    <td className="text-center sticky right-0 bg-white border-l border-slate-200">
                                        <IconButton
                                            icon={Trash2}
                                            variant="danger"
                                            size="sm"
                                            onClick={() =>
                                                onDeleteComponent(assembly.id, comp.id)
                                            }
                                            tooltip="Delete component"
                                        />
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Footer total row */}
                        <tr className="bg-slate-800 text-white font-bold h-8 border-t-2 border-slate-900">
                            <td colSpan={14} className="text-right px-4 uppercase text-xs tracking-wider" />
                            <td className="sticky right-0 bg-slate-800" />
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Save / Close footer */}
            <div className="bg-slate-100 p-2 border-t border-slate-200 flex justify-end items-center gap-2">
                {isDirty && (
                    <Button
                        variant="primary"
                        size="sm"
                        isLoading={isSavingAssembly}
                        onClick={onSaveClick}
                    >
                        Save
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

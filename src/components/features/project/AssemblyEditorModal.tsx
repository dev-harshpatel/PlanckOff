'use client';

import React, { useState } from 'react';
import { WallAssembly, MaterialDefinition, AssemblyComponent } from '@/types';
import { Trash2, Plus, AppWindow } from 'lucide-react';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from '@/constants/defaultAssemblies';
import { Button, CloseButton, IconButton, MaterialSearch, Modal, NumberInput } from '@/components/ui';
import { FormulaDebugModal } from '@/components/features/project/FormulaDebugModal';
import { AssemblyEditorSidebar } from './AssemblyEditorSidebar';

interface AssemblyEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    assembly: WallAssembly;
    updateAssemblyInfo: (id: string, field: keyof WallAssembly, value: any) => void;
    totalAggLength: number;
    materials: MaterialDefinition[];
    handleMaterialSelect: (assemblyId: string, componentId: string, material: MaterialDefinition) => void;
    handleUpdateComponent: (assemblyId: string, componentId: string, field: keyof AssemblyComponent, value: any) => void;
    handleAddComponent: (assemblyId: string) => void;
    handleDeleteComponent: (assemblyId: string, componentId: string) => void;
    getRowDetails: (comp: AssemblyComponent, assembly: WallAssembly, instances: any[]) => any;
    takeoffInstances: any[];
    statsByHeight: Record<string, { len: number, area: number, perim?: number }>;
    selectedHeight: number | null;
    onSelectHeight: (height: number | null) => void;
    onLoadTemplate?: (template: AssemblyTemplate) => void;
    templates?: AssemblyTemplate[];
}

export const AssemblyEditorModal: React.FC<AssemblyEditorModalProps> = ({
    isOpen, onClose, assembly, updateAssemblyInfo, totalAggLength, materials,
    handleMaterialSelect, handleUpdateComponent, handleAddComponent, handleDeleteComponent,
    getRowDetails, takeoffInstances, statsByHeight, selectedHeight, onSelectHeight,
    onLoadTemplate, templates = DEFAULT_TEMPLATES
}) => {
    const [rowSearchOpen, setRowSearchOpen] = useState<string | null>(null);
    const [rowSearchQuery, setRowSearchQuery] = useState('');
    const [tempAssembly, setTempAssembly] = useState(assembly);

    // Debug Modal State
    const [debugComponent, setDebugComponent] = useState<{ comp: AssemblyComponent, vars: any } | null>(null);

    // Sync tempAssembly when assembly changes
    React.useEffect(() => {
        setTempAssembly(assembly);
    }, [assembly]);



    const getUnitSuffix = (u: string) => {
        if (!u) return '';
        const lower = u.toLowerCase();
        if (lower.includes('sf') || lower.includes('sq')) return 'SF';
        if (lower.includes('lf') || lower.includes('ft') || lower.includes('pcs')) return 'LF';
        return 'EA';
    };

    // Column Resizing Logic
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
        total: 110
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

    React.useEffect(() => {
        if (!resizingCol) return;

        const onMouseMove = (e: MouseEvent) => {
            const diff = e.clientX - startX;
            setColWidths(prev => ({
                ...prev,
                [resizingCol]: Math.max(30, startWidth + diff)
            }));
        };

        const onMouseUp = () => {
            setResizingCol(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [resizingCol, startX, startWidth]);

    // MaterialSearch component handles its own click outside and escape key logic

    // CellInput is now replaced with CellNumberInput component from common

    const Resizer = ({ col }: { col: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20 group"
            onMouseDown={(e) => startResize(col, e)}
        >
            <div className="w-[1px] h-full bg-slate-300 mx-auto group-hover:bg-blue-400" />
        </div>
    );

    // Match Code column with database: resolve row code (same as Code cell), then lookup by code
    const getMaterialByRowCode = (comp: AssemblyComponent): MaterialDefinition | undefined => {
        const byDescription = materials.find((m) => m.description === comp.materialName);
        const rowCode = comp.materialCode ?? byDescription?.code;
        return rowCode ? materials.find((m) => m.code === rowCode) : undefined;
    };

    // Unit Cost = override ?? "Production rate (per unit)" from database (matched by Code column)
    const getUnitCostForRow = (comp: AssemblyComponent): number | undefined => {
        const mat = getMaterialByRowCode(comp);
        const val = comp.overrideMatCost ?? mat?.productivity;
        return val != null ? val : undefined;
    };

    // Use same quantity as displayed in Qty column so Total Cost = Unit Cost × displayed Qty
    const getDisplayedQuantity = (details: { quantity?: number }) => {
        const q = details.quantity ?? 0;
        return q >= 10 ? Math.round(q) : Math.round(q * 100) / 100;
    };

    // Total Cost column value = Unit Cost × (displayed Qty)
    const getRowTotalCost = (comp: AssemblyComponent) => {
        const details = getRowDetails(comp, assembly, takeoffInstances);
        const unitCost = getUnitCostForRow(comp);
        const displayedQty = getDisplayedQuantity(details);
        return (unitCost ?? 0) * displayedQty;
    };

    // Displayed totals = sum of "Total Cost" column (Unit Cost × Qty per row)
    const totalCost = assembly.components.reduce((sum, comp) => sum + getRowTotalCost(comp), 0);

    // Bifurcate by Code column tag (MAT. vs LABOR) — same logic as Code cell
    const getIsLaborRow = (comp: AssemblyComponent) => {
        if (comp.materialCode) return comp.materialCode.startsWith("LAB-");
        const mat = materials.find((m) => m.description === comp.materialName);
        return mat?.category === "Labor";
    };
    let totalLaborCost = 0;
    let totalMaterialCost = 0;
    assembly.components.forEach((comp) => {
        const rowTotal = getRowTotalCost(comp);
        if (getIsLaborRow(comp)) totalLaborCost += rowTotal;
        else totalMaterialCost += rowTotal;
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            closeOnOverlayClick={false}
            showCloseButton={false}
        >
            <div className="bg-white w-full h-[95vh] flex flex-col overflow-hidden">
                {/* Header (Title Bar) */}
                <div className="bg-blue-600 text-white px-6 py-3 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <AppWindow className="w-6 h-6" />
                        Edit Assembly: {assembly.code}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-xs opacity-80 uppercase tracking-widest">Total cost</div>
                            <div className="text-2xl font-bold font-mono leading-none">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <CloseButton
                            onClick={onClose}
                            size="md"
                            variant="light"
                        />
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT SIDEBAR (Inputs) */}
                    <AssemblyEditorSidebar
                        assembly={assembly}
                        tempAssembly={tempAssembly}
                        setTempAssembly={setTempAssembly}
                        updateAssemblyInfo={updateAssemblyInfo}
                        totalAggLength={totalAggLength}
                        statsByHeight={statsByHeight}
                        selectedHeight={selectedHeight}
                        onSelectHeight={onSelectHeight}
                        onLoadTemplate={onLoadTemplate}
                        templates={templates}
                        totalCost={totalCost}
                        totalLaborCost={totalLaborCost}
                        totalMaterialCost={totalMaterialCost}
                    />

                    {/* RIGHT CONTENT (9 Cols) */}
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0 gap-4">
                            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">Assembly Components</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Plus}
                                onClick={() => handleAddComponent(assembly.id)}
                                className="shrink-0 whitespace-nowrap"
                            >
                                Add Component
                            </Button>
                        </div>

                        <div className="flex-1 overflow-auto p-0 bg-white relative">
                            <table className="min-w-full text-[11px] border-collapse font-sans table-fixed" style={{ width: 'max-content' }}>
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm border-b border-slate-300 h-8">
                                    <tr>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.index }}>#<Resizer col="index" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.lab }}>Code<Resizer col="lab" /></th>
                                        <th className="relative border-r border-slate-300 text-left pl-2" style={{ width: colWidths.desc }}>Item / Description<Resizer col="desc" /></th>
                                        <th className="relative border-r border-slate-300 text-center px-1 whitespace-nowrap" style={{ width: colWidths.sect }}>Sect<Resizer col="sect" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.height }}>Hgt<Resizer col="height" /></th>
                                        <th className="relative border-r border-slate-300 text-center px-1" style={{ width: colWidths.oc }}>OC<Resizer col="oc" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.layers }}>Layering<Resizer col="layers" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.waste }}>Wst%<Resizer col="waste" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.qty }}>Qty<Resizer col="qty" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.uom }}>UOM<Resizer col="uom" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.seQty }}>Se.Qty<Resizer col="seQty" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.mou }}>MOU<Resizer col="mou" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.matCost }}>Unit Cost<Resizer col="matCost" /></th>
                                        <th className="relative border-r border-slate-300 text-center font-bold" style={{ width: colWidths.total }}>Total Cost<Resizer col="total" /></th>
                                        <th className="w-8 sticky right-0 bg-slate-100 z-10 border-l border-slate-300"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {assembly.components.map((comp, idx) => {
                                        const details = getRowDetails(comp, assembly, takeoffInstances);

                                        // Use section from material_matches (sectionCode) — no inference
                                        const section = comp.sectionCode || "";

                                        // Hgt: from overrideHeight (from JSON) or assembly.defaultHeight
                                        const heightVal =
                                            comp.overrideHeight != null
                                                ? `${comp.overrideHeight}'`
                                                : comp.heightCondition?.max
                                                    ? `${comp.heightCondition.max}'`
                                                    : assembly.defaultHeight
                                                        ? `${assembly.defaultHeight}'`
                                                        : "";

                                        // OC: from ocSpacing (from assembly-data) or extract from usage
                                        let ocVal = "";
                                        if (comp.ocSpacing) {
                                            ocVal = comp.ocSpacing;
                                        } else {
                                            const ocMatch = comp.usage.match(/Vertical @ (\d+)"? OC/);
                                            ocVal = ocMatch
                                                ? `${ocMatch[1]}"`
                                                : comp.usage.includes("16")
                                                    ? "16\""
                                                    : comp.usage.includes("24")
                                                        ? "24\""
                                                        : comp.usage.includes("12")
                                                            ? "12\""
                                                            : "";
                                        }

                                        // Layering: only for gypsum board (layers not applicable to steel framing, labor, etc.)
                                        const isGypsumComponent =
                                            comp.overrideLayers != null ||
                                            comp.usage.includes("Coverage") ||
                                            /gypsum|wallboard|drywall|type x/i.test(comp.materialName);
                                        let layersVal = "";
                                        if (isGypsumComponent) {
                                            if (comp.usage.includes("2 Layer")) layersVal = "2.00";
                                            else if (comp.usage.includes("Coverage")) layersVal = "1.00";
                                            else if (comp.usage.includes("Tracks (Top & Bottom)")) layersVal = "2";
                                            else if (comp.usage.toLowerCase().includes("track") && !comp.usage.includes("&")) layersVal = "1";
                                        }



                                        // UOM Options Check
                                        // Se.Qty: best available alt unit value
                                        const altU = details.altUnits || {};
                                        const seQtyVal = altU.sf || altU.lf || altU.m2 || altU.m || null;
                                        const mouVal = altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '-';

                                        return (
                                            <tr
                                                key={comp.id}
                                                className="hover:bg-blue-50/20 transition-colors h-7 cursor-pointer"
                                                onDoubleClick={() => setDebugComponent({ comp, vars: details.calculationVars || {} })}
                                            >
                                                <td className="border-r border-slate-200 text-center bg-slate-50">{idx + 1}</td>

                                                {/* Code */}
                                                <td className="border-r border-slate-200 text-center px-1">
                                                    {(() => {
                                                        // Use materialCode from component if available (from JSON import)
                                                        if (comp.materialCode) {
                                                            const isLabor = comp.materialCode.startsWith('LAB-');
                                                            return (
                                                                <div className="flex flex-col items-center leading-none py-0.5">
                                                                    <span className="font-bold text-[10px] text-slate-700">{comp.materialCode}</span>
                                                                    <span className={`text-[8px] uppercase font-bold ${isLabor ? 'text-amber-600' : 'text-cyan-600'}`}>
                                                                        {isLabor ? 'Labor' : 'Mat.'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }

                                                        // Otherwise, look up from materials database
                                                        const mat = materials.find(m => m.description === comp.materialName);
                                                        if (!mat) return <span className="text-slate-300">-</span>;
                                                        return (
                                                            <div className="flex flex-col items-center leading-none py-0.5">
                                                                <span className="font-bold text-[10px] text-slate-700">{mat.code}</span>
                                                                <span className={`text-[8px] uppercase font-bold ${mat.category === 'Labor' ? 'text-amber-600' : 'text-cyan-600'}`}>
                                                                    {mat.category === 'Labor' ? 'Labor' : 'Mat.'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* Item / Description */}
                                                <td className="border-r border-slate-200 relative p-0">
                                                    <div
                                                        className="w-full h-full px-2 flex items-center cursor-pointer hover:bg-slate-50"
                                                        onClick={() => { setRowSearchOpen(comp.id); setRowSearchQuery(''); }}
                                                    >
                                                        <span className="truncate">{comp.materialName}</span>
                                                    </div>
                                                    {/* Material Search */}
                                                    <MaterialSearch
                                                        materials={materials}
                                                        onSelect={(mat) => handleMaterialSelect(assembly.id, comp.id, mat)}
                                                        isOpen={rowSearchOpen === comp.id}
                                                        onClose={() => setRowSearchOpen(null)}
                                                        searchQuery={rowSearchQuery}
                                                        onSearchChange={setRowSearchQuery}
                                                        className="top-full left-0 mt-1 w-[400px]"
                                                    />
                                                </td>

                                                <td className="border-r border-slate-200 text-center text-slate-500 px-1 whitespace-nowrap">{section}</td>

                                                {/* Inputs */}
                                                <td className="border-r border-slate-200 text-center p-0">
                                                    <NumberInput
                                                        cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.overrideHeight}
                                                        onChange={(val) =>
                                                            handleUpdateComponent(assembly.id, comp.id, "overrideHeight", val)
                                                        }
                                                        placeholder={heightVal}
                                                    />
                                                </td>
                                                <td className="border-r border-slate-200 text-center px-1">
                                                    {comp.usage.includes('Vertical') ? (
                                                        <input
                                                            className="w-full h-full bg-transparent text-center outline-none"
                                                            value={ocVal.replace('"', '')}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                // Only allow numeric input
                                                                if (!/^\d*$/.test(val)) return;
                                                                handleUpdateComponent(assembly.id, comp.id, 'usage', `Vertical @ ${val}" OC`);
                                                            }}
                                                        />
                                                    ) : (
                                                        ocVal
                                                    )}
                                                </td>
                                                <td className="border-r border-slate-200 text-center p-0">
                                                    {isGypsumComponent ? (
                                                        <NumberInput
                                                            cellMode
                                                            className="w-full h-full bg-transparent text-center outline-none"
                                                            value={comp.overrideLayers}
                                                            onChange={(val) =>
                                                                handleUpdateComponent(assembly.id, comp.id, "overrideLayers", val)
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
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.wasteFactor}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'wasteFactor', val)}
                                                        placeholder="5"
                                                        scale={0.01} // Display as 5, save as 0.05
                                                    />
                                                </td>

                                                {/* Qty Column - Editable for Fixed Qty */}
                                                <td className="border-r border-slate-200 text-center font-bold px-1 p-0">
                                                    {comp.usage === 'Fixed Qty' ? (
                                                        <NumberInput cellMode
                                                            className="w-full h-full bg-transparent text-center outline-none font-bold"
                                                            value={comp.overrideQuantity}
                                                            onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideQuantity', val)}
                                                            placeholder={details.quantity.toFixed(0)}
                                                        />
                                                    ) : (
                                                        details.quantity.toFixed(details.quantity < 10 ? 2 : 0)
                                                    )}
                                                </td>

                                                {/* UOM */}
                                                <td className="border-r border-slate-200 text-center px-1 font-medium">
                                                    {getUnitSuffix(comp.selectedUnit || details.unit)}
                                                </td>

                                                {/* Se.Qty */}
                                                <td className="border-r border-slate-200 text-center px-1 text-slate-600">
                                                    {seQtyVal != null ? seQtyVal.toFixed(seQtyVal < 10 ? 2 : 0) : '-'}
                                                </td>

                                                {/* MOU */}
                                                <td className="border-r border-slate-200 text-center px-1 text-slate-600 truncate" title={details.unit}>
                                                    {details.unit}
                                                </td>

                                                {/* Unit Cost = Production rate (per unit) from database, matched by Code column */}
                                                <td className="border-r border-slate-200 text-center font-medium p-0">
                                                    {(() => {
                                                        const mat = getMaterialByRowCode(comp);
                                                        const prodRate = mat?.productivity;
                                                        const displayValue = comp.overrideMatCost ?? prodRate;
                                                        return (
                                                            <NumberInput cellMode
                                                                className="w-full h-full bg-transparent text-center outline-none font-medium"
                                                                value={displayValue}
                                                                onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideMatCost', val)}
                                                                placeholder={prodRate != null ? prodRate.toFixed(2) : (details.unitPrice ? details.unitPrice.toFixed(2) : '-')}
                                                            />
                                                        );
                                                    })()}
                                                </td>

                                                {/* Total Cost = Unit Cost × Qty */}
                                                <td className="text-center font-bold bg-slate-50 text-slate-800 border-r border-slate-200">
                                                    {getRowTotalCost(comp).toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </td>

                                                <td className="text-center sticky right-0 bg-white border-l border-slate-200">
                                                    <IconButton
                                                        icon={Trash2}
                                                        variant="danger"
                                                        size="sm"
                                                        onClick={() => handleDeleteComponent(assembly.id, comp.id)}
                                                        tooltip="Delete component"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Footer row — Total column removed */}
                                    <tr className="bg-slate-800 text-white font-bold h-8 border-t-2 border-slate-900">
                                        <td colSpan={14} className="text-right px-4 uppercase text-xs tracking-wider"></td>
                                        <td className="sticky right-0 bg-slate-800"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-slate-100 p-2 border-t border-slate-200 flex justify-end">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onClose}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Render Formula Debug Modal */}
            {debugComponent && (
                <FormulaDebugModal
                    isOpen={true}
                    onClose={() => setDebugComponent(null)}
                    component={debugComponent.comp}
                    variables={debugComponent.vars}
                    onUpdateFormula={(formula) => {
                        handleUpdateComponent(assembly.id, debugComponent.comp.id, 'usage', 'Custom Formula');
                        handleUpdateComponent(assembly.id, debugComponent.comp.id, 'customFormula', formula);
                    }}
                />
            )}
        </Modal>
    );
};

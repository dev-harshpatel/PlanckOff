'use client';

import React, { useState } from 'react';
import { WallAssembly, MaterialDefinition, AssemblyComponent } from '@/types';
import { X, Trash2, Plus, AppWindow } from 'lucide-react';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from '@/constants/defaultAssemblies';
import { Button, IconButton, MaterialSearch, Modal, NumberInput, Select } from '@/components/ui';
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
    onLoadTemplate?: (template: AssemblyTemplate) => void;
    templates?: AssemblyTemplate[];
}

export const AssemblyEditorModal: React.FC<AssemblyEditorModalProps> = ({
    isOpen, onClose, assembly, updateAssemblyInfo, totalAggLength, materials,
    handleMaterialSelect, handleUpdateComponent, handleAddComponent, handleDeleteComponent,
    getRowDetails, takeoffInstances, statsByHeight, onLoadTemplate, templates = DEFAULT_TEMPLATES
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
        sect: 50,
        desc: 250,
        lab: 90,
        height: 50,
        oc: 40,
        layers: 50,
        waste: 40,
        qty: 60,
        uom: 60,
        formula: 120,
        matCost: 70,
        totalMat: 70,
        labCost: 70,
        totalLab: 70,
        total: 100
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

    const totalCost = assembly.components.reduce((sum, comp) => sum + (getRowDetails(comp, assembly, takeoffInstances).totalCompositeCost || 0), 0);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            closeOnOverlayClick={false}
            showCloseButton={false}
        >
            <div className="bg-white w-[98vw] h-[95vh] flex flex-col overflow-hidden">
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
                        <IconButton
                            icon={X}
                            variant="default"
                            size="lg"
                            onClick={onClose}
                            className="text-white hover:bg-blue-700"
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
                        onLoadTemplate={onLoadTemplate}
                        templates={templates}
                        totalCost={totalCost}
                    />

                    {/* RIGHT CONTENT (9 Cols) */}
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                            <h3 className="font-bold text-slate-800 text-sm">Assembly Components</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Plus}
                                onClick={() => handleAddComponent(assembly.id)}
                            >
                                Add Component
                            </Button>
                        </div>

                        <div className="flex-1 overflow-auto p-0 bg-white relative">
                            <table className="min-w-full text-[11px] border-collapse font-sans table-fixed" style={{ width: 'max-content' }}>
                                <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm border-b border-slate-300 h-8">
                                    <tr>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.index }}>#<Resizer col="index" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.sect }}>Sect<Resizer col="sect" /></th>
                                        <th className="relative border-r border-slate-300 text-left pl-2" style={{ width: colWidths.desc }}>Item / Description<Resizer col="desc" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.lab }}>Code<Resizer col="lab" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.height }}>Hgt<Resizer col="height" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.oc }}>OC<Resizer col="oc" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.layers }}>Lyring<Resizer col="layers" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.waste }}>Wst%<Resizer col="waste" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.qty }}>Qty<Resizer col="qty" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.uom }}>UOM<Resizer col="uom" /></th>
                                        <th className="relative border-r border-slate-300 text-left pl-2" style={{ width: colWidths.formula }}>Formula Basis<Resizer col="formula" /></th>
                                        <th className="relative border-r border-slate-300 text-right pr-1" style={{ width: colWidths.matCost }}>Unit Mat<Resizer col="matCost" /></th>
                                        <th className="relative border-r border-slate-300 text-right pr-1" style={{ width: colWidths.totalMat }}>Tot Mat<Resizer col="totalMat" /></th>
                                        <th className="relative border-r border-slate-300 text-right pr-1" style={{ width: colWidths.labCost }}>Unit Lab<Resizer col="labCost" /></th>
                                        <th className="relative border-r border-slate-300 text-right pr-1" style={{ width: colWidths.totalLab }}>Tot Lab<Resizer col="totalLab" /></th>
                                        <th className="relative text-right pr-2 font-bold" style={{ width: colWidths.total }}>Total<Resizer col="total" /></th>
                                        <th className="w-8 sticky right-0 bg-slate-100 z-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {assembly.components.map((comp, idx) => {
                                        const details = getRowDetails(comp, assembly, takeoffInstances);
                                        const isMaterial = !comp.materialName.toLowerCase().includes('labor') && !comp.materialName.toLowerCase().includes('install');
                                        const matName = comp.materialName;

                                        // Infer Section
                                        let section = "09200";
                                        if (matName.includes("Stud") || matName.includes("Track")) section = "09100";
                                        if (matName.includes("Insulation")) section = "07210";
                                        if (matName.includes("Tape") || matName.includes("Joint")) section = "09240";

                                        // Infer Height/OC/Layers
                                        const heightVal = comp.heightCondition?.max ? `${comp.heightCondition.max}'` : (assembly.defaultHeight ? `${assembly.defaultHeight}'` : '');

                                        // OC Extraction using Regex to support custom values
                                        const ocMatch = comp.usage.match(/Vertical @ (\d+)"? OC/);
                                        const ocVal = ocMatch ? `${ocMatch[1]}"` : (comp.usage.includes('16') ? '16"' : (comp.usage.includes('24') ? '24"' : (comp.usage.includes('12') ? '12"' : '')));


                                        // Track Logic for Layers Column
                                        let layersVal = '';
                                        if (comp.usage.includes('2 Layer')) layersVal = '2.00';
                                        else if (comp.usage.includes('Coverage')) layersVal = '1.00';
                                        else if (comp.usage.includes('Tracks (Top & Bottom)')) layersVal = '2';
                                        else if (comp.usage.toLowerCase().includes('track') && !comp.usage.includes('&')) layersVal = '1';



                                        // UOM Options Check
                                        const hasM2 = details.altUnits?.m2;
                                        const hasLF = details.altUnits?.lf;
                                        const hasM = details.altUnits?.m;
                                        const unitOptions = [details.unit];
                                        if (hasM2 && !unitOptions.includes('m²')) unitOptions.push('m²');
                                        if (hasLF && !unitOptions.includes('LF')) unitOptions.push('LF');
                                        if (hasM && !unitOptions.includes('m')) unitOptions.push('m');
                                        if (details.unit.includes('ft') && !unitOptions.includes('Pcs')) unitOptions.push('Pcs');
                                        if (details.unit.includes('sheet') && !unitOptions.includes('SF')) unitOptions.push('SF');

                                        return (
                                            <tr
                                                key={comp.id}
                                                className="hover:bg-blue-50/20 transition-colors h-7 cursor-pointer"
                                                onDoubleClick={() => setDebugComponent({ comp, vars: details.calculationVars || {} })}
                                            >
                                                <td className="border-r border-slate-200 text-center bg-slate-50">{idx + 1}</td>
                                                <td className="border-r border-slate-200 text-center text-slate-500">{section}</td>

                                                {/* Item / Description - Cyan Highlight */}
                                                <td className="border-r border-slate-200 relative p-0">
                                                    <div
                                                        className={`w-full h-full px-2 flex items-center cursor-pointer ${isMaterial ? 'bg-cyan-200' : 'bg-white'}`}
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

                                                <td className="border-r border-slate-200 text-center px-1">
                                                    {(() => {
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

                                                {/* Inputs - Yellow Highlight */}
                                                <td className="border-r border-slate-200 text-center bg-yellow-200 p-0">
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.overrideHeight}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideHeight', val)}
                                                        placeholder={heightVal}
                                                    />
                                                </td>
                                                <td className="border-r border-slate-200 text-center bg-yellow-200 p-0">
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
                                                <td className="border-r border-slate-200 text-center bg-yellow-200 p-0">
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.overrideLayers}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideLayers', val)}
                                                        placeholder={layersVal}
                                                        type="float" // Allow 1.5 layers?
                                                    />
                                                </td>

                                                {/* Waste Factor */}
                                                <td className="border-r border-slate-200 text-center bg-yellow-200 p-0">
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.wasteFactor}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'wasteFactor', val)}
                                                        placeholder="5"
                                                        scale={0.01} // Display as 5, save as 0.05
                                                    />
                                                </td>

                                                {/* Qty Column - Editable for Fixed Qty */}
                                                <td className={`border-r border-slate-200 text-center font-bold px-1 p-0 ${comp.usage === 'Fixed Qty' ? 'bg-yellow-200' : ''}`}>
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

                                                {/* UOM Dropdown */}
                                                <td className="border-r border-slate-200 text-center p-0">
                                                    <Select
                                                        containerClassName="w-full"
                                                        options={Array.from(new Set(unitOptions)).map((unit) => ({
                                                            value: unit,
                                                            label: getUnitSuffix(unit),
                                                        }))}
                                                        size="xs"
                                                        value={comp.selectedUnit || details.unit}
                                                        variant="ghost"
                                                        className="h-full px-1 pr-7 text-center text-[10px] leading-none focus:ring-0"
                                                        onValueChange={(nextValue) => handleUpdateComponent(assembly.id, comp.id, 'selectedUnit', nextValue)}
                                                        aria-label="Unit of measure"
                                                    />
                                                </td>

                                                {/* Formula Basis */}
                                                <td className="border-r border-slate-200 text-xs px-2 text-slate-600 truncate" title={details.formulaDescription}>
                                                    {details.formulaDescription}
                                                </td>

                                                {/* Costs - Green Highlight */}
                                                <td className="border-r border-slate-200 text-right pr-1 bg-green-300 font-medium p-0">
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-right pr-1 outline-none font-medium"
                                                        value={comp.overrideMatCost}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideMatCost', val)}
                                                        placeholder={details.unitPrice ? details.unitPrice.toFixed(2) : '-'}
                                                    />
                                                </td>
                                                <td className="border-r border-slate-200 text-right pr-1 bg-green-50 font-medium">
                                                    {details.materialTotal.toFixed(0)}
                                                </td>

                                                <td className="border-r border-slate-200 text-right pr-1 bg-green-300 font-medium p-0">
                                                    <NumberInput cellMode
                                                        className="w-full h-full bg-transparent text-right pr-1 outline-none font-medium"
                                                        value={comp.overrideLaborCost}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideLaborCost', val)}
                                                        placeholder={details.laborUnitPrice ? details.laborUnitPrice.toFixed(2) : '-'}
                                                    />
                                                </td>
                                                <td className="border-r border-slate-200 text-right pr-1 bg-green-50 font-medium">
                                                    {details.laborTotal.toFixed(0)}
                                                </td>

                                                {/* Total - Bright Green */}
                                                <td className="text-right pr-2 font-bold bg-green-500 text-slate-900 border-r border-slate-200">
                                                    {(details.materialTotal + details.laborTotal).toFixed(0)}
                                                </td>

                                                <td className="text-center">
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

                                    {/* Footer Totals Row */}
                                    <tr className="bg-slate-800 text-white font-bold h-8 border-t-2 border-slate-900">
                                        <td colSpan={15} className="text-right px-4 uppercase text-xs tracking-wider">Total</td>
                                        <td className="text-right px-2 bg-green-600 text-white border-l border-slate-700">
                                            {totalCost.toFixed(0)}
                                        </td>
                                        <td></td>
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

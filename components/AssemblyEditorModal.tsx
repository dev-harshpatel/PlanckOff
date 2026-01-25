import React, { useState } from 'react';
import { WallAssembly, MaterialDefinition, AssemblyComponent } from '../types';
import { X, Ruler, Search, Trash2, Plus, Info, AppWindow, LayoutTemplate } from 'lucide-react';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from './defaultAssemblies';

import { FormulaDebugModal } from './FormulaDebugModal';

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
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);

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

    // Close Search Drodown on Click Outside or Escape
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setRowSearchOpen(null);
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (rowSearchOpen && !(e.target as Element).closest('.search-dropdown-container')) {
                setRowSearchOpen(null);
            }
        };

        if (rowSearchOpen) {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [rowSearchOpen]);

    // Helper Component for Inputs to allow decimal typing
    const CellInput = ({
        value,
        onChange,
        placeholder,
        className,
        type = 'float',
        scale = 1 // scale factor (e.g. 0.01 for percentage)
    }: {
        value: number | undefined;
        onChange: (val: number | undefined) => void;
        placeholder?: string;
        className?: string;
        type?: 'float' | 'int';
        scale?: number;
    }) => {
        const [localVal, setLocalVal] = useState<string>(value !== undefined ? (value * (type === 'float' && scale !== 1 ? 1 / scale : 1)).toString() : '');

        // Sync with prop when it changes externally
        React.useEffect(() => {
            const currentParsed = parseFloat(localVal);
            const propVal = value !== undefined ? (value * (type === 'float' && scale !== 1 ? 1 / scale : 1)) : undefined;

            if (propVal !== undefined && propVal !== currentParsed) {
                setLocalVal(propVal.toString());
            } else if (propVal === undefined && localVal !== '') {
                setLocalVal('');
            }
        }, [value]);

        const commit = () => {
            if (localVal === '') {
                onChange(undefined);
                return;
            }
            if (localVal === '.') return; // ignore invalid

            let num = parseFloat(localVal);
            if (isNaN(num)) return;

            if (type === 'int') num = parseInt(localVal);

            if (scale !== 1) num = num * scale;

            onChange(num);
        };

        return (
            <input
                className={className}
                value={localVal}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
                        setLocalVal(v);
                    }
                }}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                placeholder={placeholder}
            />
        );
    };

    const Resizer = ({ col }: { col: string }) => (
        <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20 group"
            onMouseDown={(e) => startResize(col, e)}
        >
            <div className="w-[1px] h-full bg-slate-300 mx-auto group-hover:bg-blue-400" />
        </div>
    );

    if (!isOpen) return null;

    const totalCost = assembly.components.reduce((sum, comp) => sum + (getRowDetails(comp, assembly, takeoffInstances).totalCompositeCost || 0), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8 font-sans">
            <div className="bg-white rounded-xl shadow-2xl w-[98vw] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

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
                        <button onClick={onClose} className="p-1 hover:bg-blue-700 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT SIDEBAR (Inputs) */}
                    <div className="w-[300px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
                        <div className="p-6 space-y-6">
                            {/* Basic Info */}
                            <div className="space-y-4">
                                {onLoadTemplate && assembly.components.length === 0 && (
                                    <div className="relative z-20">
                                        <button
                                            onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                            className="w-full py-2 px-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
                                        >
                                            <LayoutTemplate className="w-4 h-4" /> Load Default Template
                                        </button>
                                        {isTemplateDropdownOpen && (
                                            <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                                <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                    Select Template
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto">
                                                    {templates.map((tpl, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={() => { onLoadTemplate(tpl); setIsTemplateDropdownOpen(false); }}
                                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                                                        >
                                                            <div className="text-xs font-bold text-slate-800">{tpl.name}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assembly Code</label>
                                    <input
                                        className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                                        value={tempAssembly.code}
                                        onChange={(e) => setTempAssembly({ ...tempAssembly, code: e.target.value })}
                                        onBlur={() => updateAssemblyInfo(assembly.id, 'code', tempAssembly.code)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                                        <select
                                            className="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none"
                                            value={tempAssembly.assemblyType || 'Wall'}
                                            onChange={(e) => {
                                                const val = e.target.value as any;
                                                setTempAssembly({ ...tempAssembly, assemblyType: val });
                                                updateAssemblyInfo(assembly.id, 'assemblyType', val);
                                            }}
                                        >
                                            <option value="Wall">Framing (Wall)</option>
                                            <option value="Ceiling">Ceiling</option>
                                            <option value="Soffit">Soffit</option>
                                        </select>
                                    </div>
                                    {tempAssembly.assemblyType === 'Ceiling' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Grid/Type</label>
                                            <select
                                                className="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none"
                                                value={tempAssembly.ceilingSubtype || 'Suspended'}
                                                onChange={(e) => {
                                                    const val = e.target.value as any;
                                                    setTempAssembly({ ...tempAssembly, ceilingSubtype: val });
                                                    updateAssemblyInfo(assembly.id, 'ceilingSubtype', val);
                                                }}
                                            >
                                                <option value="Suspended">Suspended / General</option>
                                                <option value="ACT Ceiling">ACT (Tile)</option>
                                                <option value="Baffles">Baffles</option>
                                                <option value="Suspended Grid">Drywall Grid</option>
                                                <option value="Framed Ceiling">Framed (Joist)</option>
                                                <option value="Hard Lid">Hard Lid</option>
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                                        <select
                                            className="w-full px-2 py-2 border border-slate-300 rounded bg-white text-sm outline-none"
                                            value={tempAssembly.framingType || 'Light Metal'}
                                            onChange={(e) => {
                                                const val = e.target.value as any;
                                                setTempAssembly({ ...tempAssembly, framingType: val });
                                                updateAssemblyInfo(assembly.id, 'framingType', val);
                                            }}
                                        >
                                            <option value="Light Metal">Light Gauge</option>
                                            <option value="Wood">Wood</option>
                                            <option value="Heavy Metal">Red Iron</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                                    <textarea
                                        className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 min-h-[80px]"
                                        value={tempAssembly.description}
                                        onChange={(e) => setTempAssembly({ ...tempAssembly, description: e.target.value })}
                                        onBlur={() => updateAssemblyInfo(assembly.id, 'description', tempAssembly.description)}
                                    />
                                </div>
                            </div>

                            {/* Global Parameters */}
                            <div className="border-t border-slate-200 pt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Ruler className="w-4 h-4 text-blue-600" />
                                    <h3 className="font-bold text-slate-700 text-sm">Global Parameters</h3>
                                    {Object.keys(statsByHeight).length === 0 && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 uppercase font-bold">Prototype</span>}
                                </div>

                                {Object.keys(statsByHeight).length > 0 ? (
                                    <div className="space-y-2">
                                        {(Object.entries(statsByHeight) as [string, { len: number, area: number, perim?: number }][]).map(([h, stats]) => (
                                            <div key={h} className="flex justify-between text-sm text-slate-700 items-center">
                                                <div className="font-medium text-xs">{parseFloat(h) === 0 ? 'Ceiling' : `Wall @ ${h}'`}</div>
                                                <div className="flex gap-2">
                                                    {assembly.assemblyType === 'Ceiling' ? (
                                                        <>
                                                            <span className="bg-blue-100 px-2 rounded font-mono text-xs">{stats.area.toFixed(0)} SF</span>
                                                            <span className="bg-slate-100 px-2 rounded font-mono text-xs text-slate-500">{stats.perim?.toFixed(0) || 0} LF</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="bg-slate-100 px-2 rounded font-mono text-xs">{stats.len.toFixed(0)} LF</span>
                                                            <span className="text-slate-400 text-xs">{stats.area.toFixed(0)} SF</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">{assembly.assemblyType === 'Ceiling' ? 'Area (SF)' : 'Length (ft)'}</label>
                                            <input type="number" className="w-full p-1 text-sm border border-slate-300 rounded text-center font-mono focus:ring-blue-500 outline-none"
                                                value={(assembly.assemblyType === 'Ceiling' ? tempAssembly.defaultArea : tempAssembly.defaultLength) || ''}
                                                placeholder={assembly.assemblyType === 'Ceiling' ? '1000' : '100'}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (assembly.assemblyType === 'Ceiling') {
                                                        setTempAssembly({ ...tempAssembly, defaultArea: val });
                                                    } else {
                                                        setTempAssembly({ ...tempAssembly, defaultLength: val });
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (assembly.assemblyType === 'Ceiling') {
                                                        updateAssemblyInfo(assembly.id, 'defaultArea', tempAssembly.defaultArea);
                                                    } else {
                                                        updateAssemblyInfo(assembly.id, 'defaultLength', tempAssembly.defaultLength);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">{assembly.assemblyType === 'Ceiling' ? 'Perimeter (LF)' : 'Height (ft)'}</label>
                                            <input type="number" className="w-full p-1 text-sm border border-slate-300 rounded text-center font-mono focus:ring-blue-500 outline-none"
                                                value={(assembly.assemblyType === 'Ceiling' ? tempAssembly.defaultPerimeter : tempAssembly.defaultHeight) || ''}
                                                placeholder={assembly.assemblyType === 'Ceiling' ? '130' : '10'}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (assembly.assemblyType === 'Ceiling') {
                                                        setTempAssembly({ ...tempAssembly, defaultPerimeter: val });
                                                    } else {
                                                        setTempAssembly({ ...tempAssembly, defaultHeight: val });
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (assembly.assemblyType === 'Ceiling') {
                                                        updateAssemblyInfo(assembly.id, 'defaultPerimeter', tempAssembly.defaultPerimeter);
                                                    } else {
                                                        updateAssemblyInfo(assembly.id, 'defaultHeight', tempAssembly.defaultHeight);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Summary Card */}
                            <div className="bg-blue-900 text-white p-4 rounded-lg shadow-md mt-auto">
                                <div className="flex justify-between items-baseline mb-2">
                                    <span className="text-xs font-bold opacity-70 uppercase">Total Qty</span>
                                    {assembly.assemblyType === 'Ceiling' ? (
                                        <div className="text-right">
                                            <div className="text-xl font-bold">{totalAggLength > 0 ? (totalAggLength).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0} <span className="text-xs font-medium opacity-70">SF</span></div>
                                            {/* We need to pass Total Perimeter here but for now showing SF is primary. Length variable for ceilings IS Area in this codebase context usually */}
                                        </div>
                                    ) : (
                                        <span className="text-xl font-bold">{totalAggLength.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs font-medium opacity-70">LF</span></span>
                                    )}
                                </div>
                                <div className="border-t border-blue-800 pt-2 flex justify-between items-baseline">
                                    <span className="text-xs font-bold opacity-70 uppercase">Total Cost</span>
                                    <span className="text-2xl font-bold text-emerald-400">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT CONTENT (9 Cols) */}
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                            <h3 className="font-bold text-slate-800 text-sm">Assembly Components</h3>
                            <button onClick={() => handleAddComponent(assembly.id)} className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-xs font-bold transition-colors">
                                <Plus className="w-3 h-3" /> Add Component
                            </button>
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
                                                    {/* Search Dropdown */}
                                                    {rowSearchOpen === comp.id && (
                                                        <div className="search-dropdown-container absolute top-full left-0 mt-1 w-[400px] max-h-[300px] overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-xl z-50 flex flex-col">
                                                            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                                                                <input
                                                                    type="text" autoFocus placeholder="Search..."
                                                                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded outline-none"
                                                                    value={rowSearchQuery} onChange={(e) => setRowSearchQuery(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex-1 overflow-y-auto">
                                                                {materials.filter(m => m.description.toLowerCase().includes(rowSearchQuery.toLowerCase())).slice(0, 50).map(mat => (
                                                                    <div key={mat.code}
                                                                        className="px-2 py-1 hover:bg-blue-50 cursor-pointer text-xs border-b border-slate-50"
                                                                        onClick={(e) => { e.stopPropagation(); handleMaterialSelect(assembly.id, comp.id, mat); setRowSearchOpen(null); }}
                                                                    >
                                                                        <div className="font-bold">{mat.description}</div>
                                                                        <div className="flex justify-between text-slate-400"><span>{mat.category}</span><span>${mat.matCost}</span></div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
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
                                                    <CellInput
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
                                                    <CellInput
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.overrideLayers}
                                                        onChange={(val) => handleUpdateComponent(assembly.id, comp.id, 'overrideLayers', val)}
                                                        placeholder={layersVal}
                                                        type="float" // Allow 1.5 layers?
                                                    />
                                                </td>

                                                {/* Waste Factor */}
                                                <td className="border-r border-slate-200 text-center bg-yellow-200 p-0">
                                                    <CellInput
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
                                                        <CellInput
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
                                                    <select
                                                        className="w-full h-full bg-transparent text-center outline-none text-[10px]"
                                                        value={comp.selectedUnit || details.unit}
                                                        onChange={(e) => handleUpdateComponent(assembly.id, comp.id, 'selectedUnit', e.target.value)}
                                                    >
                                                        {Array.from(new Set(unitOptions)).map(u => (
                                                            <option key={u} value={u}>{getUnitSuffix(u)}</option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* Formula Basis */}
                                                <td className="border-r border-slate-200 text-xs px-2 text-slate-600 truncate" title={details.formulaDescription}>
                                                    {details.formulaDescription}
                                                </td>

                                                {/* Costs - Green Highlight */}
                                                <td className="border-r border-slate-200 text-right pr-1 bg-green-300 font-medium p-0">
                                                    <CellInput
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
                                                    <CellInput
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
                                                    <button onClick={() => handleDeleteComponent(assembly.id, comp.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
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
                            <button onClick={onClose} className="px-5 py-1.5 bg-blue-700 text-white text-xs font-bold rounded hover:bg-blue-800 uppercase tracking-widest shadow">
                                Close
                            </button>
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
        </div>
    );
};

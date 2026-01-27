'use client';


import React, { useMemo, useState } from 'react';
import { WallAssembly, TakeoffInstance, MaterialDefinition } from '@/types';
import { calculateMaterials } from '@/lib/gemini/calculateMaterials';
import { ChevronRight, ChevronDown, Check, FileSpreadsheet, Trash2 } from 'lucide-react';

interface AssemblySummaryGridProps {
    assemblies: WallAssembly[];
    takeoffs: Record<string, TakeoffInstance[]>;
    materials: MaterialDefinition[];
    priceMap: Record<string, { cost: number; per?: string; waste?: number; supplier?: string }>;
    onSelectAssembly: (id: string) => void;
    onEditAssembly?: (id: string) => void;
    selectedAssemblyId?: string | null;
    onDeleteAssembly?: (id: string) => void;
}

interface SummaryRow {
    id: string; // assemblyId
    code: string;
    name: string;
    type: string;
    totalQty: number;
    totalPerimeter?: number; // Added Perimeter
    unit: string;
    unitCost: number;
    totalCost: number;
    instanceCount: number;
}

export const AssemblySummaryGrid: React.FC<AssemblySummaryGridProps> = ({
    assemblies,
    takeoffs,
    materials,
    priceMap,
    onSelectAssembly,
    onEditAssembly,
    selectedAssemblyId,
    onDeleteAssembly
}) => {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Calculate Summary Data
    const summaryRows: SummaryRow[] = useMemo(() => {
        return assemblies.map(asm => {
            const instances = takeoffs[asm.id] || [];
            if (instances.length === 0) {
                return {
                    id: asm.id,
                    code: asm.code,
                    name: asm.description,
                    type: asm.assemblyType || 'Wall',
                    totalQty: 0,
                    totalPerimeter: 0,
                    unit: asm.assemblyType === 'Ceiling' ? 'SF' : 'LF',
                    unitCost: 0,
                    totalCost: 0,
                    instanceCount: 0
                };
            }

            // Calculate Costs
            let aggCost = 0;
            let aggQty = 0;
            let aggPerim = 0;

            instances.forEach(inst => {
                const mats = calculateMaterials(asm, [inst], materials);
                let instCost = 0;
                mats.forEach(m => {
                    let unitPrice = m.overridePrice || 0;
                    if (!unitPrice && priceMap[m.item]) unitPrice = priceMap[m.item].cost;
                    if (m.category === 'Labor' && !unitPrice) unitPrice = 65;
                    instCost += (m.quantity * unitPrice);
                });
                aggCost += instCost;

                // Qty & Perim
                if (asm.assemblyType === 'Ceiling') {
                    aggQty += (inst.ceilingArea || 0);
                    aggPerim += (inst.perimeter || 0);
                } else {
                    aggQty += ((inst.length || 0) * (inst.quantity || 1));
                    aggPerim += 0; // Walls dont usually sum perimeter here, just Length
                    // Could potentially sum length as perimeter for walls if desired
                }
            });

            // Determine Display Type
            let displayType: string = asm.assemblyType || 'Wall';
            if (asm.assemblyType === 'Ceiling') {
                if (asm.description.toLowerCase().includes('tile') || asm.description.toLowerCase().includes('act')) displayType = 'ACT Ceiling';
                else if (asm.description.toLowerCase().includes('baffle')) displayType = 'Baffles';
                else if (asm.description.toLowerCase().includes('grid')) displayType = 'Suspended Grid';
                else if (asm.description.toLowerCase().includes('joist') || asm.description.toLowerCase().includes('frame')) displayType = 'Framed Ceiling';
                // Fallback to explicit subtype if available
                if (asm.ceilingSubtype) displayType = asm.ceilingSubtype;
            } else if (asm.assemblyType === 'Soffit') {
                displayType = 'Soffits';
            } else if (asm.assemblyType === 'Bulkhead') {
                displayType = 'Bulkheads';
            } else if (asm.assemblyType === 'Hollow Metal Frame') {
                displayType = 'H.M. Frames';
            } else if (asm.assemblyType === 'Access Panel') {
                displayType = 'Access Panels';
            } else if (asm.assemblyType === 'Interior Wall') {
                displayType = 'Interior Walls';
            } else if (asm.assemblyType === 'Exterior Wall') {
                displayType = 'Exterior Walls';
            }

            return {
                id: asm.id,
                code: asm.code,
                name: asm.description,
                type: displayType,
                totalQty: aggQty,
                totalPerimeter: aggPerim,
                unit: asm.assemblyType === 'Ceiling' ? 'SF' : 'LF',
                unitCost: aggQty > 0 ? aggCost / aggQty : 0,
                totalCost: aggCost,
                instanceCount: instances.length
            };
        });
    }, [assemblies, takeoffs, materials, priceMap]);

    // Grouping
    const groupedRows = useMemo(() => {
        const groups: Record<string, SummaryRow[]> = {};
        summaryRows.forEach(row => {
            const type = row.type;
            if (!groups[type]) groups[type] = [];
            groups[type].push(row);
        });
        return groups;
    }, [summaryRows]);

    // Initialize expanded groups
    useMemo(() => {
        const initial: Record<string, boolean> = {};
        Object.keys(groupedRows).forEach(g => initial[g] = true);
        if (Object.keys(expandedGroups).length === 0 && Object.keys(initial).length > 0) {
            setExpandedGroups(initial);
        }
    }, [groupedRows]);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans text-xs">
            {/* Header */}
            <div className="flex-none bg-white border-b border-slate-200 font-bold text-slate-600 flex items-center px-2 py-2 sticky top-0 z-10 shadow-sm">
                <div className="w-12 px-1">Code</div>
                <div className="flex-1 px-2">Description</div>
                <div className="w-14 text-right px-1">Qty</div>
                <div className="w-12 text-right px-1 text-[10px] text-slate-400">Perm</div>
                <div className="w-16 text-right px-1">Total</div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {Object.entries(groupedRows).sort().map(([group, groupRows]: [string, SummaryRow[]]) => (
                    <div key={group}>
                        <div
                            className="flex items-center px-2 py-1 bg-slate-100 hover:bg-slate-200 cursor-pointer border-b border-slate-200 font-bold text-slate-700"
                            onClick={() => toggleGroup(group)}
                        >
                            <div className="w-4 flex justify-center mr-1">
                                {expandedGroups[group] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </div>
                            {group} ({groupRows.length})
                        </div>

                        {expandedGroups[group] && groupRows.map(row => (
                            <div
                                key={row.id}
                                onClick={() => onSelectAssembly(row.id)}
                                onDoubleClick={() => onEditAssembly && onEditAssembly(row.id)}
                                className={`flex items-center px-2 py-1.5 border-b border-slate-100 cursor-pointer transition-colors group relative
                                    ${selectedAssemblyId === row.id ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-700'}
                                `}
                            >
                                <div className={`w-12 px-1 truncate font-medium ${selectedAssemblyId === row.id ? 'text-blue-100' : 'text-slate-500'}`}>{row.code}</div>
                                <div className="flex-1 px-2 truncate font-medium">{row.name}</div>
                                <div className="w-14 text-right px-1 font-mono text-[10px]">{Math.round(row.totalQty).toLocaleString()} {row.unit}</div>
                                <div className="w-12 text-right px-1 font-mono text-[10px] text-slate-400">{row.type === 'ACT Ceiling' || row.type === 'Suspended Grid' || row.type === 'Baffles' || row.type.includes('Ceiling') ? Math.round(row.totalPerimeter || 0) : '-'}</div>
                                <div className="w-16 text-right px-1 font-mono font-bold">{Math.round(row.totalCost).toLocaleString()}</div>

                                {/* DELETE BUTTON - Show on hover */}
                                {onDeleteAssembly && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Delete this assembly and all its instances?")) {
                                                onDeleteAssembly(row.id);
                                            }
                                        }}
                                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 hover:text-red-600 hidden group-hover:flex
                                            ${selectedAssemblyId === row.id ? 'text-white hover:text-red-200 hover:bg-white/20' : 'text-slate-400'}
                                        `}
                                        title="Delete Assembly"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

'use client';

import React, { useMemo, useState } from 'react';
import { WallAssembly, TakeoffInstance } from '@/types';
import { Trash2, Filter, ArrowUp, ArrowDown, X } from 'lucide-react';
import { ConfirmModal, Select } from '@/components/ui';

interface TakeoffScheduleViewProps {
    assemblies: WallAssembly[];
    takeoffs: Record<string, TakeoffInstance[]>;
    onUpdateInstance?: (assemblyId: string, instanceId: string, field: string, value: any) => void;
    onDeleteInstance?: (assemblyId: string, instanceId: string) => void;
}

export const TakeoffScheduleView: React.FC<TakeoffScheduleViewProps> = ({
    assemblies,
    takeoffs,
    onUpdateInstance,
    onDeleteInstance
}) => {
    // Filter State
    const [filterType, setFilterType] = useState('All');
    const [filterLevel, setFilterLevel] = useState('All');
    const [filterText, setFilterText] = useState('');

    // Delete confirmation state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ assemblyId: string; instanceId: string } | null>(null);

    const openDeleteModal = (assemblyId: string, instanceId: string) => {
        setItemToDelete({ assemblyId, instanceId });
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (itemToDelete && onDeleteInstance) {
            onDeleteInstance(itemToDelete.assemblyId, itemToDelete.instanceId);
        }
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
    };

    // Sort State
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Unique Levels for Dropdown
    const uniqueLevels = useMemo(() => {
        const levels = new Set<string>();
        Object.values(takeoffs).flat().forEach((t: TakeoffInstance) => levels.add(t.level || ''));
        return Array.from(levels).filter(Boolean).sort();
    }, [takeoffs]);

    // Flatten list and include assembly type
    const flatList = useMemo(() => {
        const list: {
            id: string,
            assembly: WallAssembly,
            instance: TakeoffInstance
        }[] = [];

        Object.entries(takeoffs).forEach(([asmId, instances]: [string, TakeoffInstance[]]) => {
            const asm = assemblies.find(a => a.id === asmId);
            if (!asm) return;
            instances.forEach(inst => {
                list.push({
                    id: inst.id,
                    assembly: asm,
                    instance: inst
                });
            });
        });

        // Filter
        let filtered = list.filter(item => {
            if (filterType !== "All") {
                const type = item.assembly.assemblyType || "Interior Walls";
                if (filterType === "Ceiling" && !type.includes("Ceiling")) return false;
                if (filterType === "Interior Walls" && !type.includes("Interior")) return false;
                if (filterType === "Exterior Walls" && !type.includes("Exterior")) return false;
                if (!["Ceiling", "Interior Walls", "Exterior Walls"].includes(filterType) && type !== filterType) return false;
            }
            if (filterLevel !== 'All' && item.instance.level !== filterLevel) return false;
            if (filterText) {
                const searchStr = (item.assembly.code + item.instance.description + item.assembly.description).toLowerCase();
                if (!searchStr.includes(filterText.toLowerCase())) return false;
            }
            return true;
        });

        // Sort
        if (sortCol) {
            filtered.sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                switch (sortCol) {
                    case 'type': valA = a.assembly.assemblyType || ''; valB = b.assembly.assemblyType || ''; break;
                    case 'code': valA = a.assembly.code || ''; valB = b.assembly.code || ''; break;
                    case 'level': valA = a.instance.level || ''; valB = b.instance.level || ''; break;
                    case 'description': valA = a.instance.description || ''; valB = b.instance.description || ''; break;
                    case 'length': valA = a.instance.length || 0; valB = b.instance.length || 0; break;
                    case 'area':
                        valA = a.instance.ceilingArea ?? 0;
                        valB = b.instance.ceilingArea ?? 0;
                        break;
                    case 'perimeter': valA = a.instance.perimeter || 0; valB = b.instance.perimeter || 0; break;
                }

                if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [assemblies, takeoffs, filterType, filterLevel, filterText, sortCol, sortDir]);

    const handleSort = (col: string) => {
        if (sortCol === col) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    const handleFieldChange = (row: typeof flatList[0], field: string, value: any) => {
        if (!onUpdateInstance) return;
        onUpdateInstance(row.assembly.id, row.instance.id, field, value);
    };

    const renderSortArrow = (col: string) => {
        if (sortCol !== col) return null;
        return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
    };

    return (
        <div className="flex flex-col h-full bg-white font-sans">
            {/* TOOLBAR */}
            <div className="flex-none bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-4 @container">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-slate-500">
                        <Filter className="w-3 h-3" />
                        <span className="text-xs font-bold uppercase">Filters:</span>
                    </div>

                    <Select
                        containerClassName="w-auto"
                        options={[
                            { value: "All", label: "All Types" },
                            { value: "Interior Walls", label: "Interior Walls" },
                            { value: "Exterior Walls", label: "Exterior Walls" },
                            { value: "Ceiling", label: "Ceiling" },
                            { value: "BulkHead", label: "BulkHead" },
                            { value: "Access Pannel", label: "Access Pannel" },
                            { value: "HM Frames", label: "HM Frames" },
                        ]}
                        size="xs"
                        value={filterType}
                        variant="filter"
                        onValueChange={setFilterType}
                        aria-label="Filter by type"
                    />

                    <Select
                        containerClassName="w-28"
                        options={[
                            { value: 'All', label: 'All Levels' },
                            ...uniqueLevels.map((level) => ({ value: level, label: level })),
                        ]}
                        size="xs"
                        value={filterLevel}
                        variant="filter"
                        onValueChange={setFilterLevel}
                        aria-label="Filter by level"
                    />

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search description..."
                            className="bg-white border border-slate-300 text-xs rounded pl-2 pr-6 py-1 outline-none focus:border-blue-500 w-40"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                        />
                        {filterText && (
                            <button onClick={() => setFilterText('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* HEADER */}
            <div className="flex-none bg-slate-100 border-b border-slate-200 px-4 py-1 text-[10px] font-bold text-slate-500 flex uppercase tracking-wider select-none">
                <div className="w-32 cursor-pointer hover:text-blue-600 flex items-center" onClick={() => handleSort('type')}>Type {renderSortArrow('type')}</div>
                <div className="w-24 cursor-pointer hover:text-blue-600 flex items-center" onClick={() => handleSort('code')}>Code {renderSortArrow('code')}</div>
                <div className="w-16 cursor-pointer hover:text-blue-600 flex items-center" onClick={() => handleSort('level')}>Lvl {renderSortArrow('level')}</div>
                <div className="flex-1 cursor-pointer hover:text-blue-600 flex items-center" onClick={() => handleSort('description')}>Desc {renderSortArrow('description')}</div>
                <div className="w-20 text-right cursor-pointer hover:text-blue-600 flex items-center justify-end" onClick={() => handleSort('length')}>Length {renderSortArrow('length')}</div>
                <div className="w-12 text-center">Unit</div>
                <div className="w-20 text-right cursor-pointer hover:text-blue-600 flex items-center justify-end" onClick={() => handleSort('area')}>Area {renderSortArrow('area')}</div>
                <div className="w-12 text-center">Unit</div>
                <div className="w-20 text-right cursor-pointer hover:text-blue-600 flex items-center justify-end" onClick={() => handleSort('perimeter')}>Perim {renderSortArrow('perimeter')}</div>
                <div className="w-8"></div>
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-y-auto">
                {flatList.map((row, idx) => {
                    const isCeiling = row.assembly.assemblyType === 'Ceiling';

                    return (
                        <div key={row.id} className={`flex px-4 py-1 border-b border-slate-100 text-xs hover:bg-slate-50 items-center group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                            {/* TYPE DROPDOWN */}
                            <div className="w-32 pr-2">
                                    <Select
                                        options={[
                                            { value: "Interior Walls", label: "Interior Walls" },
                                            { value: "Exterior Walls", label: "Exterior Walls" },
                                            { value: "Ceiling", label: "Ceiling" },
                                            { value: "BulkHead", label: "BulkHead" },
                                            { value: "Access Pannel", label: "Access Pannel" },
                                            { value: "HM Frames", label: "HM Frames" },
                                        ]}
                                        size="xs"
                                        value={
                                            row.assembly.assemblyType ||
                                            "Interior Walls"
                                        }
                                    variant="ghost"
                                    className="text-[11px]"
                                    onValueChange={(nextValue) => {
                                        // This updates the assembly definition itself
                                        handleFieldChange(row, 'assemblyType', nextValue);
                                    }}
                                    aria-label="Assembly type"
                                />
                            </div>

                            {/* CODE (Read-only or rename assembly?) */}
                            <div className="w-24 font-medium text-slate-600 truncate pr-2" title={row.assembly.description}>
                                {row.assembly.code}
                            </div>

                            {/* LEVEL */}
                            <div className="w-16 pr-2">
                                <input
                                    className="w-full bg-transparent border border-transparent hover:border-slate-300 rounded focus:border-blue-400 outline-none text-slate-500"
                                    value={row.instance.level || ''}
                                    placeholder="-"
                                    onChange={(e) => handleFieldChange(row, 'level', e.target.value)}
                                />
                            </div>

                            {/* DESCRIPTION */}
                            <div className="flex-1 pr-2">
                                <input
                                    className="w-full bg-transparent border border-transparent hover:border-slate-300 rounded focus:border-blue-400 outline-none text-slate-800"
                                    value={row.instance.description}
                                    onChange={(e) => handleFieldChange(row, 'description', e.target.value)}
                                />
                            </div>

                            {/* LENGTH */}
                            <div className="w-20 text-right pr-2">
                                <input
                                    type="number"
                                    className="w-full text-right font-mono text-slate-600 bg-transparent border border-transparent hover:border-slate-300 rounded focus:border-blue-400 outline-none"
                                    value={row.instance.length ?? ''}
                                    placeholder="-"
                                    onChange={(e) => handleFieldChange(row, 'length', parseFloat(e.target.value))}
                                />
                            </div>

                            {/* LENGTH UNIT */}
                            <div className="w-12 text-center text-[10px] text-slate-400 font-medium">
                                {row.instance.lengthUnit || (row.instance.length ? 'LF' : '-')}
                            </div>

                            {/* AREA (Calculated or Override) */}
                            <div className="w-20 text-right pr-2">
                                <span className="text-slate-500 font-mono">
                                    {row.instance.ceilingArea ? row.instance.ceilingArea.toFixed(0) : '—'}
                                </span>
                            </div>

                            {/* AREA UNIT */}
                            <div className="w-12 text-center text-[10px] text-slate-400 font-medium">
                                {row.instance.areaUnit || 'SF'}
                            </div>

                            {/* PERIMETER (Only for Ceilings usually, but user asked for it) */}
                            <div className="w-20 text-right">
                                <input
                                    type="number"
                                    className="w-full text-right font-mono text-slate-600 bg-transparent border border-transparent hover:border-slate-300 rounded focus:border-blue-400 outline-none"
                                    value={row.instance.perimeter ?? ''}
                                    placeholder={!isCeiling ? '-' : ''}
                                    onChange={(e) => handleFieldChange(row, 'perimeter', parseFloat(e.target.value))}
                                />
                            </div>

                            {/* DELETE BUTTON */}
                            <div className="w-8 flex justify-center">
                                {onDeleteInstance && (
                                    <button
                                        onClick={() => openDeleteModal(row.assembly.id, row.instance.id)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Instance"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {flatList.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-sm">
                        {takeoffs && Object.keys(takeoffs).length > 0 ? "No items match your filter." : "No items. Click \"Add Manual Item\" to start."}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null); }}
                onConfirm={confirmDelete}
                title="Delete Item"
                message="Are you sure you want to delete this takeoff item? This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    );
};

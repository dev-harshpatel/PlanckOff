'use client';

import React, { useState } from 'react';
import { WallAssembly } from '@/types';
import { AssemblyTemplate } from '@/constants/defaultAssemblies';
import { ChevronDown, LayoutTemplate, Ruler } from 'lucide-react';
import { Button, NumberInput } from '@/components/ui';

interface AssemblyEditorSidebarProps {
    assembly: WallAssembly;
    tempAssembly: WallAssembly;
    setTempAssembly: (assembly: WallAssembly) => void;
    updateAssemblyInfo: <K extends keyof WallAssembly>(id: string, field: K, value: WallAssembly[K]) => void;
    totalAggLength: number;
    statsByHeight: Record<string, { len: number, area: number, perim?: number }>;
    selectedHeight: number | null;
    onSelectHeight: (height: number | null) => void;
    onLoadTemplate?: (template: AssemblyTemplate) => void;
    templates?: AssemblyTemplate[];
    totalCost: number;
    totalLaborCost: number;
    totalMaterialCost: number;
}

const fmtCost = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SidebarLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{children}</p>
);

const inputCls = "w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-300";

export const AssemblyEditorSidebar: React.FC<AssemblyEditorSidebarProps> = ({
    assembly,
    tempAssembly,
    setTempAssembly,
    updateAssemblyInfo,
    totalAggLength,
    statsByHeight,
    selectedHeight,
    onSelectHeight,
    onLoadTemplate,
    templates = [],
    totalCost,
    totalLaborCost,
    totalMaterialCost,
}) => {
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);

    const categoryOptions = [
        "Interior Walls",
        "Exterior Walls",
        "Ceiling",
        "BulkHead",
        "Access Pannel",
        "HM Frames",
    ];

    return (
        <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">

            {/* ── Form fields ── */}
            <div className="p-5 space-y-4 flex-1">

                {/* Load template */}
                {onLoadTemplate && assembly.components.length === 0 && (
                    <div className="relative z-20">
                        <Button
                            variant="secondary"
                            onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                            icon={LayoutTemplate}
                            fullWidth
                        >
                            Load Default Template
                        </Button>
                        {isTemplateDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-30">
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Template</p>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-50">
                                    {templates.map((tpl, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => { onLoadTemplate(tpl); setIsTemplateDropdownOpen(false); }}
                                            className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors"
                                        >
                                            <p className="text-xs font-semibold text-slate-800">{tpl.name}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Assembly Code */}
                <div>
                    <SidebarLabel>Assembly Code</SidebarLabel>
                    <input
                        className={`${inputCls} font-bold text-base`}
                        value={tempAssembly.code}
                        onChange={(e) => setTempAssembly({ ...tempAssembly, code: e.target.value })}
                        onBlur={() => updateAssemblyInfo(assembly.id, 'code', tempAssembly.code)}
                    />
                </div>

                {/* Category */}
                <div>
                    <SidebarLabel>Category</SidebarLabel>
                    <div className="relative">
                        <select
                            className={`${inputCls} appearance-none pr-8 cursor-pointer`}
                            value={tempAssembly.assemblyType || 'Interior Walls'}
                            onChange={(e) => {
                                const nextAssemblyType = e.target.value as WallAssembly['assemblyType'];
                                setTempAssembly({ ...tempAssembly, assemblyType: nextAssemblyType });
                                updateAssemblyInfo(assembly.id, 'assemblyType', nextAssemblyType);
                            }}
                        >
                            {categoryOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Description */}
                <div>
                    <SidebarLabel>Description</SidebarLabel>
                    <textarea
                        className={`${inputCls} min-h-[80px] resize-none leading-relaxed`}
                        value={tempAssembly.description}
                        onChange={(e) => setTempAssembly({ ...tempAssembly, description: e.target.value })}
                        onBlur={() => updateAssemblyInfo(assembly.id, 'description', tempAssembly.description)}
                        placeholder="Assembly description…"
                    />
                </div>

                {/* Global Parameters */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Ruler className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <SidebarLabel>Global Parameters</SidebarLabel>
                        {Object.keys(statsByHeight).length === 0 && (
                            <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                Prototype
                            </span>
                        )}
                    </div>

                    {Object.keys(statsByHeight).length > 0 ? (
                        <div className="space-y-2">
                            {(() => {
                                const entries = Object.entries(statsByHeight) as [string, { len: number, area: number, perim?: number }][];
                                const sortedHeights = entries.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
                                const filtered = selectedHeight != null
                                    ? sortedHeights.filter(([h]) => parseFloat(h) === selectedHeight)
                                    : sortedHeights;
                                return (
                                    <>
                                        {sortedHeights.length > 1 && (
                                            <div className="relative mb-3">
                                                <select
                                                    value={selectedHeight ?? ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        onSelectHeight(v === '' ? null : parseFloat(v));
                                                    }}
                                                    className={`${inputCls} appearance-none pr-8 cursor-pointer`}
                                                    aria-label="Filter by height"
                                                >
                                                    <option value="">All heights</option>
                                                    {sortedHeights.map(([h]) => (
                                                        <option key={h} value={h}>
                                                            {parseFloat(h) === 0 ? 'Ceiling' : `Wall @ ${h}'`}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            {filtered.map(([h, stats]) => (
                                                <div key={h} className="flex justify-between items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        {parseFloat(h) === 0 ? 'Ceiling' : `Wall @ ${h}'`}
                                                    </span>
                                                    <div className="flex gap-1.5">
                                                        {assembly.assemblyType === 'Ceiling' ? (
                                                            <>
                                                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-mono text-xs font-semibold">{stats.area.toFixed(0)} SF</span>
                                                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono text-xs">{stats.perim?.toFixed(0) || 0} LF</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-mono text-xs font-semibold">{stats.len.toFixed(0)} LF</span>
                                                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono text-xs">{stats.area.toFixed(0)} SF</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-1.5">
                                    {assembly.assemblyType === 'Ceiling' ? 'Area (SF)' : 'Length (ft)'}
                                </p>
                                <NumberInput
                                    value={assembly.assemblyType === 'Ceiling' ? tempAssembly.defaultArea : tempAssembly.defaultLength}
                                    onChange={(val) => {
                                        if (assembly.assemblyType === 'Ceiling') {
                                            setTempAssembly({ ...tempAssembly, defaultArea: val });
                                            if (val !== undefined) updateAssemblyInfo(assembly.id, 'defaultArea', val);
                                        } else {
                                            setTempAssembly({ ...tempAssembly, defaultLength: val });
                                            if (val !== undefined) updateAssemblyInfo(assembly.id, 'defaultLength', val);
                                        }
                                    }}
                                    placeholder={assembly.assemblyType === 'Ceiling' ? '1000' : '100'}
                                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md text-center font-mono focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none bg-white"
                                />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-1.5">
                                    {assembly.assemblyType === 'Ceiling' ? 'Perimeter (LF)' : 'Height (ft)'}
                                </p>
                                <NumberInput
                                    value={assembly.assemblyType === 'Ceiling' ? tempAssembly.defaultPerimeter : tempAssembly.defaultHeight}
                                    onChange={(val) => {
                                        if (assembly.assemblyType === 'Ceiling') {
                                            setTempAssembly({ ...tempAssembly, defaultPerimeter: val });
                                            if (val !== undefined) updateAssemblyInfo(assembly.id, 'defaultPerimeter', val);
                                        } else {
                                            setTempAssembly({ ...tempAssembly, defaultHeight: val });
                                            if (val !== undefined) updateAssemblyInfo(assembly.id, 'defaultHeight', val);
                                        }
                                    }}
                                    placeholder={assembly.assemblyType === 'Ceiling' ? '130' : '10'}
                                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md text-center font-mono focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none bg-white"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Cost Summary Card ── */}
            <div className="p-4 border-t border-slate-200 shrink-0">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Card header */}
                    <div className="px-4 py-2.5 bg-slate-900 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cost Summary</p>
                        <span className="text-[10px] font-semibold text-slate-300 tabular-nums">
                            {assembly.assemblyType === 'Ceiling'
                                ? `${totalAggLength > 0 ? totalAggLength.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0} SF`
                                : `${totalAggLength.toLocaleString(undefined, { maximumFractionDigits: 0 })} LF`}
                        </span>
                    </div>

                    {/* Total cost */}
                    <div className="px-4 pt-3 pb-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">Total Cost</span>
                            <span className={`text-2xl font-bold tabular-nums leading-none ${totalCost > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                ${fmtCost(totalCost)}
                            </span>
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="px-4 pb-3 pt-2 space-y-1.5 border-t border-slate-100 mt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                <span className="text-[11px] text-slate-500">Material</span>
                            </div>
                            <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                                ${fmtCost(totalMaterialCost)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                <span className="text-[11px] text-slate-500">Labour</span>
                            </div>
                            <span className="text-[11px] font-semibold text-amber-700 tabular-nums">
                                ${fmtCost(totalLaborCost)}
                            </span>
                        </div>
                        {/* Visual split bar */}
                        {totalCost > 0 && (
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                                <div
                                    className="h-full bg-emerald-400 rounded-full"
                                    style={{ width: `${Math.round((totalMaterialCost / totalCost) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

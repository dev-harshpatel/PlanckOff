'use client';

import React, { useState } from 'react';
import { WallAssembly } from '@/types';
import { AssemblyTemplate } from '@/constants/defaultAssemblies';
import { LayoutTemplate, Ruler } from 'lucide-react';
import { Button, FormField, NumberInput, SelectField } from '@/components/ui';

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
        { value: "Interior Walls", label: "Interior Walls" },
        { value: "Exterior Walls", label: "Exterior Walls" },
        { value: "Ceiling", label: "Ceiling" },
        { value: "BulkHead", label: "BulkHead" },
        { value: "Access Pannel", label: "Access Pannel" },
        { value: "HM Frames", label: "HM Frames" },
    ];

    return (
        <div className="w-[300px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-6 space-y-6">
                <div className="space-y-4">
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
                                <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Select Template
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto">
                                        {templates.map((tpl, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    onLoadTemplate(tpl);
                                                    setIsTemplateDropdownOpen(false);
                                                }}
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
                    
                    <FormField
                        label="Assembly Code"
                        value={tempAssembly.code}
                        onChange={(e) => setTempAssembly({ ...tempAssembly, code: e.target.value })}
                        onBlur={() => updateAssemblyInfo(assembly.id, 'code', tempAssembly.code)}
                        className="font-bold"
                    />

                    <SelectField
                        label="Category"
                        value={
                            tempAssembly.assemblyType ||
                            "Interior Walls"
                        }
                        onValueChange={(val) => {
                            const nextAssemblyType = val as WallAssembly["assemblyType"];
                            setTempAssembly({
                                ...tempAssembly,
                                assemblyType: nextAssemblyType,
                            });
                            updateAssemblyInfo(
                                assembly.id,
                                "assemblyType",
                                nextAssemblyType,
                            );
                        }}
                        options={categoryOptions}
                    />

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
                        {Object.keys(statsByHeight).length === 0 && (
                            <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 uppercase font-bold">
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
                                            <select
                                                value={selectedHeight ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    onSelectHeight(v === '' ? null : parseFloat(v));
                                                }}
                                                className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 mb-2 bg-white"
                                                aria-label="Filter by height"
                                            >
                                                <option value="">All heights</option>
                                                {sortedHeights.map(([h]) => (
                                                    <option key={h} value={h}>
                                                        {parseFloat(h) === 0 ? 'Ceiling' : `Wall @ ${h}'`}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {filtered.map(([h, stats]) => (
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
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">
                                    {assembly.assemblyType === 'Ceiling' ? 'Area (SF)' : 'Length (ft)'}
                                </label>
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
                                    className="w-full p-1 text-sm border border-slate-300 rounded text-center font-mono"
                                />
                            </div>
                            <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-center">
                                    {assembly.assemblyType === 'Ceiling' ? 'Perimeter (LF)' : 'Height (ft)'}
                                </label>
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
                                    className="w-full p-1 text-sm border border-slate-300 rounded text-center font-mono"
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
                                <div className="text-xl font-bold">
                                    {totalAggLength > 0 ? totalAggLength.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}{' '}
                                    <span className="text-xs font-medium opacity-70">SF</span>
                                </div>
                            </div>
                        ) : (
                            <span className="text-xl font-bold">
                                {totalAggLength.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                                <span className="text-xs font-medium opacity-70">LF</span>
                            </span>
                        )}
                    </div>
                    <div className="border-t border-blue-800 pt-2 space-y-1.5">
                        <div className="flex justify-between items-baseline">
                            <span className="text-xs font-bold opacity-70 uppercase">Total Cost</span>
                            <span className="text-2xl font-bold text-emerald-400">
                                ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                            <span className="opacity-80 uppercase">Total cost of Material</span>
                            <span className="font-semibold text-cyan-300">
                                ${totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                            <span className="opacity-80 uppercase">Total cost of Labour</span>
                            <span className="font-semibold text-amber-300">
                                ${totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

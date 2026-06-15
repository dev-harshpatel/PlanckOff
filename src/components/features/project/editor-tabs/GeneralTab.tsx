'use client';

import React, { useState } from 'react';
import { AssemblyComponent, MaterialDefinition } from '@/types';
import { MaterialSearch } from '@/components/ui';
import { ComponentField } from './ComponentField';

interface GeneralTabProps {
    localComp: AssemblyComponent;
    material: MaterialDefinition | undefined;
    isLabor: boolean;
    materials: MaterialDefinition[];
    onLocalChange: (
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => void;
    onMaterialSelect: (mat: MaterialDefinition) => void;
}

export const GeneralTab = ({
    localComp,
    material,
    isLabor,
    materials,
    onLocalChange,
    onMaterialSelect,
}: GeneralTabProps) => {
    const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
    const [materialSearchQuery, setMaterialSearchQuery] = useState('');

    return (
        <div className="space-y-5">
            {/* Material / Item selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Material / Item
                    </h3>
                </div>
                <div className="space-y-4">
                    <div className="relative">
                        <ComponentField
                            label="Item / Description"
                            value={localComp.materialName}
                            onChange={(val) => onLocalChange('materialName', val as string)}
                            placeholder="Click to search materials..."
                        />
                        <button
                            type="button"
                            onClick={() => setMaterialSearchOpen(!materialSearchOpen)}
                            className="absolute right-2 top-7 text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold underline underline-offset-2"
                        >
                            Search DB
                        </button>
                        <MaterialSearch
                            materials={
                                isLabor
                                    ? materials.filter((m) => m.category === 'Labor')
                                    : materials.filter((m) => m.category !== 'Labor')
                            }
                            onSelect={(mat) => {
                                onMaterialSelect(mat);
                                setMaterialSearchOpen(false);
                            }}
                            isOpen={materialSearchOpen}
                            onClose={() => setMaterialSearchOpen(false)}
                            searchQuery={materialSearchQuery}
                            onSearchChange={setMaterialSearchQuery}
                            className="top-full left-0 mt-1 w-full z-50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <ComponentField
                            label="Material Code"
                            value={localComp.materialCode}
                            onChange={(val) => onLocalChange('materialCode', val as string)}
                            placeholder="e.g. DW-58-X-8"
                        />
                        <ComponentField
                            label="Section Code"
                            value={localComp.sectionCode}
                            onChange={(val) => onLocalChange('sectionCode', val as string)}
                            placeholder="e.g. 09 29 00"
                        />
                    </div>
                </div>
            </div>

            {/* DB Info (read-only) */}
            {material && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-4 bg-sky-500 rounded-full" />
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                            Database Info
                        </h3>
                        <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                            Read-only from spec_database
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <ComponentField label="Category" value={material.category} disabled onChange={() => {}} />
                        <ComponentField label="Manufacturer" value={material.manufacturer} disabled onChange={() => {}} />
                        <ComponentField label="Mat Cost" value={material.matCost} disabled onChange={() => {}} />
                        <ComponentField label="Per" value={material.per} disabled onChange={() => {}} />
                        <ComponentField label="Productivity" value={material.productivity} disabled onChange={() => {}} />
                        <ComponentField label="Hourly Rate" value={material.hourlyRate} disabled onChange={() => {}} />
                    </div>
                </div>
            )}

            {/* Cost & Quantity Overrides */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-amber-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Cost & Quantity Overrides
                    </h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <ComponentField
                        label="Unit Cost Override"
                        value={localComp.overrideMatCost}
                        onChange={(val) => onLocalChange('overrideMatCost', val as number)}
                        type="number"
                        placeholder={material?.matCost?.toString() ?? '0.00'}
                    />
                    <ComponentField
                        label="Quantity Override"
                        value={localComp.overrideQuantity}
                        onChange={(val) => onLocalChange('overrideQuantity', val as number)}
                        type="number"
                        placeholder="Auto-calculated"
                    />
                    <ComponentField
                        label="UOM"
                        value={localComp.selectedUnit}
                        onChange={(val) => onLocalChange('selectedUnit', val as string)}
                        placeholder="SF"
                    />
                </div>
            </div>
        </div>
    );
};

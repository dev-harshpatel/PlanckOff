'use client';

import React, { useEffect, useState } from 'react';
import { AssemblyComponent, MaterialDefinition } from '@/types';
import { Calculator, Package, Ruler, X } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { FormulasTab } from './FormulasTab';
import { GeneralTab } from './GeneralTab';
import { getMaterialByRowCode } from './assemblyComponentHelpers';
import { SpecsTab } from './SpecsTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTabType = 'general' | 'specs' | 'formulas';

const TAB_CONFIG: {
    id: DetailTabType;
    label: string;
    icon: React.FC<{ className?: string }>;
}[] = [
    { id: 'general', label: 'General', icon: Package },
    { id: 'specs', label: 'Specifications', icon: Ruler },
    { id: 'formulas', label: 'Formulas', icon: Calculator },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ComponentDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    component: AssemblyComponent;
    material: MaterialDefinition | undefined;
    assemblyId: string;
    onUpdateField: (
        assemblyId: string,
        componentId: string,
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => void;
    onSelectMaterial: (
        assemblyId: string,
        componentId: string,
        material: MaterialDefinition,
    ) => void;
    materials: MaterialDefinition[];
    isLabor: boolean;
    isNewComponent?: boolean;
    onDeleteComponent?: (assemblyId: string, componentId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ComponentDetailModal: React.FC<ComponentDetailModalProps> = ({
    isOpen,
    onClose,
    component,
    material,
    assemblyId,
    onUpdateField,
    onSelectMaterial,
    materials,
    isLabor,
    isNewComponent = false,
    onDeleteComponent,
}) => {
    const [activeTab, setActiveTab] = useState<DetailTabType>('general');
    const [localComp, setLocalComp] = useState<AssemblyComponent>(component);

    // Only reset localComp when the modal OPENS (isOpen transitions to true).
    // Removing 'component' from deps prevents an external re-render (e.g. from
    // setOverrideMap or setMaterialCostingData in page.tsx) from creating a new
    // component object reference and silently wiping out the user's in-progress edits.
    useEffect(() => {
        if (isOpen) {
            setLocalComp(component);
            setActiveTab('general');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const handleLocalChange = (
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => {
        setLocalComp((prev) => ({ ...prev, [field]: value }));
    };

    const handleMaterialSelect = (mat: MaterialDefinition) => {
        onSelectMaterial(assemblyId, component.id, mat);
        setLocalComp((prev) => ({
            ...prev,
            materialName: mat.description,
            materialCode: mat.code,
            sectionCode: mat.section,
        }));
    };

    const handleSave = () => {
        const fields: (keyof AssemblyComponent)[] = [
            'materialName', 'materialCode', 'sectionCode', 'usage', 'ocSpacing',
            'overrideLayers', 'wasteFactor', 'overrideMatCost',
            'overrideLaborCost', 'overrideQuantity', 'selectedUnit', 'crew',
            'productionRate', 'rValue', 'customFormula',
            'formulaQtyOverride', 'formulaSecQtyOverride',
            'formulaCeilQtyOverride', 'formulaCeilSecQtyOverride',
        ];
        // overrideHeight is only editable for non-labor components;
        // labor height is auto-derived from material height segments on save.
        if (!isLabor) {
            fields.push('overrideHeight');
        }
        for (const field of fields) {
            if (localComp[field] !== component[field]) {
                onUpdateField(assemblyId, component.id, field, localComp[field]);
            }
        }
        onClose();
    };

    const resolvedMaterial = material ?? getMaterialByRowCode(localComp, materials);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            closeOnOverlayClick={false}
            showCloseButton={false}
        >
            {/* Dark Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between rounded-t-xl">
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
                            <Package className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-white">
                                {isNewComponent ? 'Add Component' : 'Component Details'}
                            </span>
                            {localComp.materialCode && (
                                <span className="text-[10px] font-mono bg-slate-700 text-emerald-300 px-2 py-0.5 rounded border border-slate-600 shrink-0">
                                    {localComp.materialCode}
                                </span>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 truncate ml-[42px] max-w-md">
                        {localComp.materialName || 'No material selected'}
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border uppercase tracking-wide ${
                            isLabor
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        }`}
                    >
                        {isLabor ? 'Labor' : 'Material'}
                    </span>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-slate-50 border-b border-slate-200 px-5">
                <div className="flex items-center gap-1">
                    {TAB_CONFIG.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={[
                                    'flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all',
                                    'border-b-2 -mb-px',
                                    isActive
                                        ? 'border-emerald-500 text-emerald-600 bg-white/60'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/40',
                                ].join(' ')}
                            >
                                <Icon
                                    className={`w-3.5 h-3.5 ${
                                        isActive ? 'text-emerald-500' : 'text-slate-400'
                                    }`}
                                />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content */}
            <div className="p-5 bg-slate-50 max-h-[60vh] overflow-y-auto">
                {activeTab === 'general' && (
                    <GeneralTab
                        localComp={localComp}
                        material={resolvedMaterial}
                        isLabor={isLabor}
                        materials={materials}
                        onLocalChange={handleLocalChange}
                        onMaterialSelect={handleMaterialSelect}
                    />
                )}
                {activeTab === 'specs' && (
                    <SpecsTab localComp={localComp} material={resolvedMaterial} onLocalChange={handleLocalChange} isLabor={isLabor} />
                )}
                {activeTab === 'formulas' && (
                    <FormulasTab
                        localComp={localComp}
                        material={resolvedMaterial}
                        onLocalChange={handleLocalChange}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-end gap-2 rounded-b-xl">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        if (isNewComponent && onDeleteComponent) {
                            onDeleteComponent(assemblyId, component.id);
                        }
                        onClose();
                    }}
                >
                    Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave}>
                    {isNewComponent ? 'Add Component' : 'Save Changes'}
                </Button>
            </div>
        </Modal>
    );
};

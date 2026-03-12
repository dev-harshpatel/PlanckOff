'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WallAssembly, MaterialDefinition, AssemblyComponent } from '@/types';
import { Trash2, Plus, AppWindow, Calculator, FunctionSquare, Package, Ruler, Settings2, X, Edit2, RotateCcw } from 'lucide-react';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from '@/constants/defaultAssemblies';
import { Button, CloseButton, IconButton, MaterialSearch, Modal, NumberInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { FormulaDebugModal } from '@/components/features/project/FormulaDebugModal';
import { FormulaEditModal } from '@/components/features/project/FormulaEditModal';
import { LocalGlobalConfirmModal } from '@/components/features/project/LocalGlobalConfirmModal';
import { AssemblyEditorSidebar } from './AssemblyEditorSidebar';
import {
    computeFormulaQuantities,
    hasFormulaForContext,
    roundToTwoDecimals,
    type ExtractedDimensions,
} from '@/lib/utils/formulaEvaluator';
import { MaterialCosting } from '@/types/assembly';
import type { ProjectOverrideMap, OverrideableField } from '@/types/core/projectOverrides';

// ─── Component Detail Modal ──────────────────────────────────────────────────

type DetailTabType = "general" | "specs" | "formulas";

const DETAIL_TAB_CONFIG: { id: DetailTabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "general", label: "General", icon: Package },
    { id: "specs", label: "Specifications", icon: Ruler },
    { id: "formulas", label: "Formulas", icon: Calculator },
];

interface ComponentDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    component: AssemblyComponent;
    material: MaterialDefinition | undefined;
    assemblyId: string;
    onUpdateField: (assemblyId: string, componentId: string, field: keyof AssemblyComponent, value: AssemblyComponent[keyof AssemblyComponent]) => void;
    onSelectMaterial: (assemblyId: string, componentId: string, material: MaterialDefinition) => void;
    materials: MaterialDefinition[];
    isLabor: boolean;
    isNewComponent?: boolean;
    onDeleteComponent?: (assemblyId: string, componentId: string) => void;
}

const ComponentDetailModal: React.FC<ComponentDetailModalProps> = ({
    isOpen, onClose, component, material, assemblyId, onUpdateField, onSelectMaterial, materials, isLabor,
    isNewComponent = false, onDeleteComponent,
}) => {
    const [activeTab, setActiveTab] = useState<DetailTabType>("general");
    const [localComp, setLocalComp] = useState<AssemblyComponent>(component);
    const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
    const [materialSearchQuery, setMaterialSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLocalComp(component);
            setActiveTab("general");
            setMaterialSearchOpen(false);
        }
    }, [isOpen, component]);

    const handleSave = () => {
        const fields: (keyof AssemblyComponent)[] = [
            'materialName', 'materialCode', 'sectionCode', 'usage', 'ocSpacing',
            'overrideHeight', 'overrideLayers', 'wasteFactor', 'overrideMatCost',
            'overrideLaborCost', 'overrideQuantity', 'selectedUnit', 'crew',
            'rValue', 'customFormula',
            'formulaQtyOverride', 'formulaSecQtyOverride',
            'formulaCeilQtyOverride', 'formulaCeilSecQtyOverride',
        ];
        for (const field of fields) {
            if (localComp[field] !== component[field]) {
                onUpdateField(assemblyId, component.id, field, localComp[field]);
            }
        }
        onClose();
    };

    const handleLocalChange = (field: keyof AssemblyComponent, value: AssemblyComponent[keyof AssemblyComponent]) => {
        setLocalComp(prev => ({ ...prev, [field]: value }));
    };

    const Field = ({
        label, value, onChange, type = "text", disabled = false, placeholder = "", isFormula = false, rows,
    }: {
        label: string;
        value: string | number | undefined | null;
        onChange: (val: string | number | undefined) => void;
        type?: "text" | "number" | "textarea";
        disabled?: boolean;
        placeholder?: string;
        isFormula?: boolean;
        rows?: number;
    }) => {
        const displayValue = value !== undefined && value !== null ? String(value) : "";

        const baseInputStyles = [
            "w-full rounded-lg px-3 py-2.5 text-sm transition-all",
            "border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400",
            disabled
                ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300",
        ].join(' ');

        const formulaStyles = [
            "w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed",
            "bg-slate-900 text-emerald-300 border border-slate-700",
            "placeholder-slate-500",
            "focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500",
            "resize-none",
        ].join(' ');

        const labelClasses = "flex items-end gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider min-h-[28px] pb-1.5";

        if (type === "textarea") {
            return (
                <div>
                    <label className={labelClasses}>
                        {label}
                    </label>
                    <textarea
                        className={isFormula ? formulaStyles : `${baseInputStyles} resize-none`}
                        value={displayValue}
                        placeholder={placeholder}
                        rows={rows ?? 2}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value || undefined)}
                        spellCheck={false}
                    />
                </div>
            );
        }

        return (
            <div>
                <label className={labelClasses}>
                    {label}
                </label>
                <input
                    type={type}
                    className={baseInputStyles}
                    value={displayValue}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => {
                        const val = e.target.value;
                        if (type === "number") {
                            onChange(val === "" ? undefined : parseFloat(val));
                        } else {
                            onChange(val || undefined);
                        }
                    }}
                />
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" closeOnOverlayClick={false} showCloseButton={false}>
            {/* Dark Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between rounded-t-xl">
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
                            <Package className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-white">
                                {isNewComponent ? "Add Component" : "Component Details"}
                            </span>
                            {localComp.materialCode && (
                                <span className="text-[10px] font-mono bg-slate-700 text-emerald-300 px-2 py-0.5 rounded border border-slate-600 shrink-0">
                                    {localComp.materialCode}
                                </span>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 truncate ml-[42px] max-w-md">
                        {localComp.materialName || "No material selected"}
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border uppercase tracking-wide ${
                        isLabor
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    }`}>
                        {isLabor ? "Labor" : "Material"}
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
                    {DETAIL_TAB_CONFIG.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={[
                                    "flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all",
                                    "border-b-2 -mb-px",
                                    isActive
                                        ? "border-emerald-500 text-emerald-600 bg-white/60"
                                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/40",
                                ].join(' ')}
                            >
                                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-500" : "text-slate-400"}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-5 bg-slate-50 max-h-[60vh] overflow-y-auto">
                {activeTab === "general" && (
                    <div className="space-y-5">
                        {/* Material Selection */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Material / Item</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="relative">
                                    <Field
                                        label="Item / Description"
                                        value={localComp.materialName}
                                        onChange={(val) => handleLocalChange('materialName', val as string)}
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
                                        materials={isLabor ? materials.filter(m => m.category === "Labor") : materials.filter(m => m.category !== "Labor")}
                                        onSelect={(mat) => {
                                            onSelectMaterial(assemblyId, component.id, mat);
                                            setLocalComp(prev => ({
                                                ...prev,
                                                materialName: mat.description,
                                                materialCode: mat.code,
                                                sectionCode: mat.section,
                                            }));
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
                                    <Field
                                        label="Material Code"
                                        value={localComp.materialCode}
                                        onChange={(val) => handleLocalChange('materialCode', val as string)}
                                        placeholder="e.g. DW-58-X-8"
                                    />
                                    <Field
                                        label="Section Code"
                                        value={localComp.sectionCode}
                                        onChange={(val) => handleLocalChange('sectionCode', val as string)}
                                        placeholder="e.g. 09 29 00"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* DB Info (Read-only) */}
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
                                    <Field label="Category" value={material.category} disabled onChange={() => {}} />
                                    <Field label="Manufacturer" value={material.manufacturer} disabled onChange={() => {}} />
                                    <Field label="Mat Cost" value={material.matCost} disabled onChange={() => {}} />
                                    <Field label="Per" value={material.per} disabled onChange={() => {}} />
                                    <Field label="Productivity" value={material.productivity} disabled onChange={() => {}} />
                                    <Field label="Hourly Rate" value={material.hourlyRate} disabled onChange={() => {}} />
                                </div>
                            </div>
                        )}

                        {/* Overrides */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-amber-500 rounded-full" />
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Cost & Quantity Overrides</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Field
                                    label="Unit Cost Override"
                                    value={localComp.overrideMatCost}
                                    onChange={(val) => handleLocalChange('overrideMatCost', val as number)}
                                    type="number"
                                    placeholder={material?.productivity?.toString() || "0.00"}
                                />
                                <Field
                                    label="Quantity Override"
                                    value={localComp.overrideQuantity}
                                    onChange={(val) => handleLocalChange('overrideQuantity', val as number)}
                                    type="number"
                                    placeholder="Auto-calculated"
                                />
                                <Field
                                    label="UOM"
                                    value={localComp.selectedUnit}
                                    onChange={(val) => handleLocalChange('selectedUnit', val as string)}
                                    placeholder="SF"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "specs" && (
                    <div className="space-y-5">
                        {/* Calculation Parameters */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-purple-500 rounded-full" />
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Calculation Parameters</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Field
                                    label="Usage / Calculation Method"
                                    value={localComp.usage}
                                    onChange={(val) => handleLocalChange('usage', val as string)}
                                    placeholder='Vertical @ 16" OC'
                                />
                                <Field
                                    label="OC Spacing"
                                    value={localComp.ocSpacing}
                                    onChange={(val) => handleLocalChange('ocSpacing', val as string)}
                                    placeholder='16"'
                                />
                                <Field
                                    label="Override Height (ft)"
                                    value={localComp.overrideHeight}
                                    onChange={(val) => handleLocalChange('overrideHeight', val as number)}
                                    type="number"
                                    placeholder="10"
                                />
                                <Field
                                    label="Override Layers"
                                    value={localComp.overrideLayers}
                                    onChange={(val) => handleLocalChange('overrideLayers', val as number)}
                                    type="number"
                                    placeholder="1"
                                />
                                <Field
                                    label="Waste Factor (%)"
                                    value={localComp.wasteFactor != null ? (localComp.wasteFactor * 100) : undefined}
                                    onChange={(val) => handleLocalChange('wasteFactor', val != null ? (val as number) / 100 : undefined)}
                                    type="number"
                                    placeholder="5"
                                />
                                <Field
                                    label="Crew Size"
                                    value={localComp.crew}
                                    onChange={(val) => handleLocalChange('crew', val as number)}
                                    type="number"
                                    placeholder="1"
                                />
                            </div>
                        </div>

                        {/* Additional Properties */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Additional Properties</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Field
                                    label="R-Value"
                                    value={localComp.rValue}
                                    onChange={(val) => handleLocalChange('rValue', val as number)}
                                    type="number"
                                    placeholder="0"
                                />
                                <Field
                                    label="Custom Formula"
                                    value={localComp.customFormula}
                                    onChange={(val) => handleLocalChange('customFormula', val as string)}
                                    placeholder="Custom formula expression"
                                />
                                <Field
                                    label="Labor Cost Override"
                                    value={localComp.overrideLaborCost}
                                    onChange={(val) => handleLocalChange('overrideLaborCost', val as number)}
                                    type="number"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "formulas" && (
                    <div className="space-y-5">
                        {/* Wall Formulas */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Wall Formula Overrides</h3>
                                </div>
                                <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                                    Overrides DB formulas for this assembly only
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-3 items-stretch">
                                    <div className="flex-1 flex flex-col">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            Qty Formula Override
                                        </label>
                                        <textarea
                                            className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                                            value={localComp.formulaQtyOverride || ""}
                                            placeholder={material?.formulaQty || "No DB formula"}
                                            rows={2}
                                            onChange={(e) => handleLocalChange('formulaQtyOverride', e.target.value || undefined)}
                                            spellCheck={false}
                                        />
                                        {material?.formulaQty && (
                                            <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100 truncate">
                                                <span className="font-bold text-slate-500">DB: </span>{material.formulaQty}
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-20 flex flex-col justify-center items-center bg-slate-50 rounded-lg border border-slate-100 px-1 py-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">MOU</span>
                                        <span className="text-xs font-mono text-slate-600 mt-1">{material?.mouWall || "—"}</span>
                                    </div>
                                </div>

                                <div className="flex gap-3 items-stretch">
                                    <div className="flex-1 flex flex-col">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            Sec. Qty Formula Override
                                        </label>
                                        <textarea
                                            className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                                            value={localComp.formulaSecQtyOverride || ""}
                                            placeholder={material?.formulaSecQty || "No DB formula"}
                                            rows={2}
                                            onChange={(e) => handleLocalChange('formulaSecQtyOverride', e.target.value || undefined)}
                                            spellCheck={false}
                                        />
                                        {material?.formulaSecQty && (
                                            <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100 truncate">
                                                <span className="font-bold text-slate-500">DB: </span>{material.formulaSecQty}
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-20 flex flex-col justify-center items-center bg-slate-50 rounded-lg border border-slate-100 px-1 py-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">MOU</span>
                                        <span className="text-xs font-mono text-slate-600 mt-1">{material?.mouWallSec || "—"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ceiling Formulas */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-sky-500 rounded-full" />
                                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ceiling Formula Overrides</h3>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-3 items-stretch">
                                    <div className="flex-1 flex flex-col">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            Ceiling Qty Formula Override
                                        </label>
                                        <textarea
                                            className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                                            value={localComp.formulaCeilQtyOverride || ""}
                                            placeholder={material?.formulaCeilQty || "No DB formula"}
                                            rows={2}
                                            onChange={(e) => handleLocalChange('formulaCeilQtyOverride', e.target.value || undefined)}
                                            spellCheck={false}
                                        />
                                        {material?.formulaCeilQty && (
                                            <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100 truncate">
                                                <span className="font-bold text-slate-500">DB: </span>{material.formulaCeilQty}
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-20 flex flex-col justify-center items-center bg-slate-50 rounded-lg border border-slate-100 px-1 py-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">MOU</span>
                                        <span className="text-xs font-mono text-slate-600 mt-1">{material?.mouCeil || "—"}</span>
                                    </div>
                                </div>

                                <div className="flex gap-3 items-stretch">
                                    <div className="flex-1 flex flex-col">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            Ceiling Sec. Qty Formula Override
                                        </label>
                                        <textarea
                                            className="flex-1 w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none"
                                            value={localComp.formulaCeilSecQtyOverride || ""}
                                            placeholder={material?.formulaCeilSecQty || "No DB formula"}
                                            rows={2}
                                            onChange={(e) => handleLocalChange('formulaCeilSecQtyOverride', e.target.value || undefined)}
                                            spellCheck={false}
                                        />
                                        {material?.formulaCeilSecQty && (
                                            <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100 truncate">
                                                <span className="font-bold text-slate-500">DB: </span>{material.formulaCeilSecQty}
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-20 flex flex-col justify-center items-center bg-slate-50 rounded-lg border border-slate-100 px-1 py-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">MOU</span>
                                        <span className="text-xs font-mono text-slate-600 mt-1">{material?.mouCeilSec || "—"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Formula Tips */}
                        <div className="px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-600">
                            <span className="font-bold">Note:</span> These overrides apply to this assembly only.
                            Leave blank to use the default formula from the material database.
                            Use variables like{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">Length</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">Height</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">Wastage</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">layer</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">sheet area</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">Ceiling Area</code>,{" "}
                            <code className="font-mono bg-blue-100 px-1 rounded">AREA COVER</code>.
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-end gap-2 rounded-b-xl">
                <Button variant="secondary" size="sm" onClick={() => {
                    if (isNewComponent && onDeleteComponent) {
                        onDeleteComponent(assemblyId, component.id);
                    }
                    onClose();
                }}>
                    Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave}>
                    {isNewComponent ? "Add Component" : "Save Changes"}
                </Button>
            </div>
        </Modal>
    );
};

// ─── Assembly Editor Modal ──────────────────────────────────────────────────

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
    /** Final output material costing data for this assembly (used to get extracted dimensions for formula evaluation) */
    materialCostingData?: MaterialCosting;
    /** Project ID — required for local/global override dialog */
    projectId?: string | null;
    /** Project-level material override map — used to show override indicators */
    overrideMap?: ProjectOverrideMap;
    /** Callback to update override map after a local save */
    onOverrideMapChange?: (updater: (prev: ProjectOverrideMap) => ProjectOverrideMap) => void;
    /** Callback to persist assembly changes (unit cost, quantity, waste) to the final output */
    onSaveAssembly?: (assembly: WallAssembly) => Promise<void>;
    /** Notifies parent to update materialCostingData so costs recalculate immediately on blur (no DB write). */
    onWasteChange?: (code: string, wastePercent: number, isLabor: boolean) => void;
}

export const AssemblyEditorModal: React.FC<AssemblyEditorModalProps> = ({
    isOpen, onClose, assembly, updateAssemblyInfo, totalAggLength, materials,
    handleMaterialSelect, handleUpdateComponent, handleAddComponent, handleDeleteComponent,
    getRowDetails, takeoffInstances, statsByHeight, selectedHeight, onSelectHeight,
    onLoadTemplate, templates = DEFAULT_TEMPLATES, materialCostingData,
    projectId, overrideMap = {}, onOverrideMapChange, onSaveAssembly, onWasteChange,
}) => {
    const toast = useToast();
    const [tempAssembly, setTempAssembly] = useState(assembly);
    const [isDirty, setIsDirty] = useState(false);
    const [isSavingAssembly, setIsSavingAssembly] = useState(false);

    // Debug Modal State
    const [debugComponent, setDebugComponent] = useState<{ comp: AssemblyComponent, vars: any } | null>(null);

    // Formula Edit Modal State
    const [formulaEditState, setFormulaEditState] = useState<{
        comp: AssemblyComponent;
        openedFrom: 'qty' | 'seqty';
        extractedDimensions?: ExtractedDimensions;
    } | null>(null);

    // Component Detail Modal State
    const [detailComp, setDetailComp] = useState<AssemblyComponent | null>(null);
    const [isNewDetailComp, setIsNewDetailComp] = useState(false);

    // Pending formula save — holds formula overrides waiting for Local/Global dialog
    const [pendingFormulaSave, setPendingFormulaSave] = useState<{
        materialCode: string;
        materialName: string;
        componentId: string;
        componentOverrides: {
            formulaQtyOverride?: string;
            formulaSecQtyOverride?: string;
            formulaCeilQtyOverride?: string;
            formulaCeilSecQtyOverride?: string;
        };
        // Fields that differ from DB — sent on "Global" save to spec_database
        materialFieldUpdates: Partial<Pick<MaterialDefinition, 'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'>>;
    } | null>(null);
    const [isSavingFormula, setIsSavingFormula] = useState(false);

    // Inline MOU editing state
    const [editingMouCell, setEditingMouCell] = useState<{ compId: string; type: 'qty' | 'seqty' } | null>(null);
    const [mouInputValue, setMouInputValue] = useState('');

    // Pending MOU save — holds MOU change awaiting Local/Global dialog
    const [pendingMouSave, setPendingMouSave] = useState<{
        materialCode: string;
        materialName: string;
        field: Extract<OverrideableField, 'mouWall' | 'mouWallSec' | 'mouCeil' | 'mouCeilSec'>;
        fieldLabel: string;
        newValue: string;
    } | null>(null);
    const [isSavingMou, setIsSavingMou] = useState(false);

    // Sync tempAssembly when assembly changes
    React.useEffect(() => {
        setTempAssembly(assembly);
    }, [assembly]);

    // Reset dirty flag when a different assembly is opened
    React.useEffect(() => {
        setIsDirty(false);
    }, [assembly.id]);

    // Marks the assembly dirty and delegates the field update to the parent's handler.
    // For wasteFactor changes, also notifies parent to refresh materialCostingData so
    // costs recalculate immediately — no DB write here; Save button handles persistence.
    const updateComp = useCallback((
        assemblyId: string,
        componentId: string,
        field: keyof AssemblyComponent,
        value: AssemblyComponent[keyof AssemblyComponent],
    ) => {
        setIsDirty(true);
        handleUpdateComponent(assemblyId, componentId, field, value);
        if (field === 'wasteFactor' && value != null && onWasteChange) {
            const comp = assembly.components.find((c) => c.id === componentId);
            if (comp?.materialCode) {
                const isLabor = comp.materialCode.startsWith('LAB-');
                onWasteChange(comp.materialCode, (value as number) * 100, isLabor);
            }
        }
    }, [handleUpdateComponent, assembly.components, onWasteChange]);

    // Save handler — maps current assembly state to final output and persists
    const handleSaveClick = useCallback(async () => {
        if (!onSaveAssembly) return;
        setIsSavingAssembly(true);
        try {
            await onSaveAssembly(assembly);
            setIsDirty(false);
            toast.success('Assembly saved');
        } catch {
            toast.error('Failed to save assembly');
        } finally {
            setIsSavingAssembly(false);
        }
    }, [onSaveAssembly, assembly, toast]);

    // Open modal for newly added component (one-shot)
    const prevCompCountRef = React.useRef(assembly.components.length);
    React.useEffect(() => {
        if (isNewDetailComp && assembly.components.length > prevCompCountRef.current) {
            const lastComp = assembly.components[assembly.components.length - 1];
            setDetailComp(lastComp);
            prevCompCountRef.current = assembly.components.length;
        } else {
            prevCompCountRef.current = assembly.components.length;
        }
    }, [isNewDetailComp, assembly.components]);



    // ─── Formula Local/Global Save Handlers ────────────────────────────────────

    const applyFormulaLocal = useCallback(async () => {
        if (!pendingFormulaSave || !projectId) return;
        const { materialCode, materialFieldUpdates } = pendingFormulaSave;
        setIsSavingFormula(true);
        try {
            for (const [field, value] of Object.entries(materialFieldUpdates) as Array<[OverrideableField, string]>) {
                const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ materialCode, field, value }),
                });
                const json = await res.json();
                if (!json.success) { toast.error(json.error ?? 'Failed to save override'); return; }
                onOverrideMapChange?.((prev) => ({
                    ...prev,
                    [materialCode]: { ...(prev[materialCode] ?? {}), [field]: value },
                }));
            }
            toast.success('Formula saved for this project only');
        } catch {
            toast.error('Failed to save override');
        } finally {
            setIsSavingFormula(false);
            setPendingFormulaSave(null);
        }
    }, [pendingFormulaSave, projectId, onOverrideMapChange, toast]);

    const applyFormulaGlobal = useCallback(async () => {
        if (!pendingFormulaSave) return;
        const { materialCode, componentId, componentOverrides, materialFieldUpdates } = pendingFormulaSave;
        if (Object.keys(materialFieldUpdates).length === 0) { setPendingFormulaSave(null); return; }
        setIsSavingFormula(true);
        try {
            const res = await fetch(`/api/materials/${encodeURIComponent(materialCode)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(materialFieldUpdates),
            });
            const json = await res.json();
            if (json.success) {
                // Clear any component-level overrides for these fields
                const overrideKeyMap: Record<string, keyof AssemblyComponent> = {
                    formulaQty: 'formulaQtyOverride', formulaSecQty: 'formulaSecQtyOverride',
                    formulaCeilQty: 'formulaCeilQtyOverride', formulaCeilSecQty: 'formulaCeilSecQtyOverride',
                };
                (Object.keys(materialFieldUpdates) as Array<keyof typeof materialFieldUpdates>).forEach((f) => {
                    const cf = overrideKeyMap[f];
                    if (cf && componentOverrides[cf as keyof typeof componentOverrides] !== undefined)
                        updateComp(assembly.id, componentId, cf, undefined);
                });
                toast.success('Formula updated in database — affects all projects');
            } else {
                toast.error(json.error ?? 'Failed to update database');
            }
        } catch {
            toast.error('Failed to update database');
        } finally {
            setIsSavingFormula(false);
            setPendingFormulaSave(null);
        }
    }, [pendingFormulaSave, assembly.id, handleUpdateComponent, toast]);

    const revertFormulaOverrides = useCallback(async (materialCode: string, fields: OverrideableField[]) => {
        if (!projectId) return;
        try {
            for (const field of fields) {
                const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ materialCode, field }),
                });
                const json = await res.json();
                if (json.success) {
                    onOverrideMapChange?.((prev) => {
                        const existing = { ...(prev[materialCode] ?? {}) };
                        delete (existing as Record<string, unknown>)[field];
                        return { ...prev, [materialCode]: existing };
                    });
                }
            }
            toast.success('Reverted to database value');
        } catch {
            toast.error('Failed to revert');
        }
    }, [projectId, onOverrideMapChange, toast]);

    // ─── MOU Local/Global Save Handlers ────────────────────────────────────────

    const applyMouLocal = useCallback(async () => {
        if (!pendingMouSave || !projectId) return;
        setIsSavingMou(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    materialCode: pendingMouSave.materialCode,
                    field: pendingMouSave.field,
                    value: pendingMouSave.newValue,
                }),
            });
            const json = await res.json();
            if (json.success) {
                onOverrideMapChange?.((prev) => ({
                    ...prev,
                    [pendingMouSave.materialCode]: {
                        ...(prev[pendingMouSave.materialCode] ?? {}),
                        [pendingMouSave.field]: pendingMouSave.newValue,
                    },
                }));
                toast.success('UOM saved for this project only');
            } else {
                toast.error(json.error ?? 'Failed to save override');
            }
        } catch {
            toast.error('Failed to save override');
        } finally {
            setIsSavingMou(false);
            setPendingMouSave(null);
        }
    }, [pendingMouSave, projectId, onOverrideMapChange, toast]);

    const applyMouGlobal = useCallback(async () => {
        if (!pendingMouSave) return;
        setIsSavingMou(true);
        try {
            const res = await fetch(`/api/materials/${encodeURIComponent(pendingMouSave.materialCode)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ [pendingMouSave.field]: pendingMouSave.newValue }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success('UOM updated in database — affects all projects');
            } else {
                toast.error(json.error ?? 'Failed to update database');
            }
        } catch {
            toast.error('Failed to update database');
        } finally {
            setIsSavingMou(false);
            setPendingMouSave(null);
        }
    }, [pendingMouSave, toast]);

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

    /** Find total_length from final_output for a component (used as the Length variable in formulas) */
    const findExtractedDimsForComponent = (comp: AssemblyComponent): ExtractedDimensions | undefined => {
        if (!materialCostingData) return undefined;
        const code = comp.materialCode;
        if (!code) return undefined;
        const item = materialCostingData.materials_costing.find(mci =>
            mci.matched_materials.some(m => m.code === code) ||
            mci.matched_labor.some(l => l.code === code),
        );
        const totalLength = item?.extracted_material?.total_length;
        if (totalLength == null) return undefined;
        return { totalLength };
    };

    // Unit Cost = override ?? "Production rate (per unit)" from database (matched by Code column)
    const getUnitCostForRow = (comp: AssemblyComponent): number | undefined => {
        const mat = getMaterialByRowCode(comp);
        const val = comp.overrideMatCost ?? mat?.productivity;
        return val != null ? val : undefined;
    };

    // Quantity used for cost = same as displayed in Qty column (formula result when has formula, else details.quantity), rounded to 2 decimals.
    const getQuantityForCost = (comp: AssemblyComponent): number => {
        const details = getRowDetails(comp, assembly, takeoffInstances);
        const mat = getMaterialByRowCode(comp);
        const isCeiling = assembly.assemblyType === "Ceiling";
        const hasFormula = hasFormulaForContext(comp, mat, isCeiling);
        if (hasFormula) {
            const extDims = findExtractedDimsForComponent(comp);
            const fq = computeFormulaQuantities(comp, mat, assembly, takeoffInstances, extDims);
            const qty = isCeiling ? fq.ceilQty : fq.qty;
            return roundToTwoDecimals(qty ?? details.quantity ?? 0);
        }
        return roundToTwoDecimals(details.quantity ?? 0);
    };

    // Total Cost column value = Unit Cost × (quantity for cost, 2 decimals)
    const getRowTotalCost = (comp: AssemblyComponent) => {
        const unitCost = getUnitCostForRow(comp);
        const qty = getQuantityForCost(comp);
        return roundToTwoDecimals((unitCost ?? 0) * qty);
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
                                onClick={() => {
                                    handleAddComponent(assembly.id);
                                    setIsNewDetailComp(true);
                                }}
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
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.qty }}>
                                            <span className="flex items-center justify-center gap-1">
                                                Qty
                                                <FunctionSquare className="w-2.5 h-2.5 text-emerald-500 opacity-70" />
                                            </span>
                                            <Resizer col="qty" />
                                        </th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.uom }}>UOM<Resizer col="uom" /></th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.seQty }}>
                                            <span className="flex items-center justify-center gap-1">
                                                Se.Qty
                                                <FunctionSquare className="w-2.5 h-2.5 text-emerald-500 opacity-70" />
                                            </span>
                                            <Resizer col="seQty" />
                                        </th>
                                        <th className="relative border-r border-slate-300 text-center" style={{ width: colWidths.mou }}>UOM<Resizer col="mou" /></th>
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



                                        // Formula-based Qty / Se.Qty
                                        const mat = getMaterialByRowCode(comp);
                                        const isCeilingAssembly = assembly.assemblyType === 'Ceiling';
                                        const extractedDims = findExtractedDimsForComponent(comp);
                                        const fq = computeFormulaQuantities(comp, mat, assembly, takeoffInstances, extractedDims);
                                        const hasFormula = hasFormulaForContext(comp, mat, isCeilingAssembly);

                                        // Override indicators — check if project has overrides for formula/MOU fields
                                        const matOverrides = mat?.code ? (overrideMap[mat.code] ?? {}) : {};
                                        const hasFormulaOverride = isCeilingAssembly
                                            ? ('formulaCeilQty' in matOverrides || 'formulaCeilSecQty' in matOverrides)
                                            : ('formulaQty' in matOverrides || 'formulaSecQty' in matOverrides);
                                        const mouQtyField = isCeilingAssembly ? 'mouCeil' : 'mouWall';
                                        const mouSeQtyField = isCeilingAssembly ? 'mouCeilSec' : 'mouWallSec';
                                        const hasMouQtyOverride = mouQtyField in matOverrides;
                                        const hasMouSeQtyOverride = mouSeQtyField in matOverrides;

                                        // Qty: formula result → stored pipeline qty → null (never fallback to getRowDetails)
                                        const formulaQtyValue = isCeilingAssembly ? fq.ceilQty : fq.qty;
                                        const displayQty = formulaQtyValue ?? comp.overrideQuantity ?? null;

                                        // Se.Qty: only show when an explicit Se.Qty formula exists — no fallback to altUnits
                                        const formulaSeQtyValue = isCeilingAssembly ? fq.ceilSeQty : fq.seQty;
                                        const displaySeQty = formulaSeQtyValue;
                                        const altU = details.altUnits || {};
                                        const mouVal = altU.sf ? 'SF' : altU.lf ? 'LF' : altU.m2 ? 'm²' : altU.m ? 'm' : '-';

                                        return (
                                            <tr
                                                key={comp.id}
                                                className="hover:bg-blue-50/20 transition-colors h-7 cursor-pointer"
                                                // onDoubleClick={() => setDebugComponent({ comp, vars: details.calculationVars || {} })}
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
                                                        className="w-full h-full px-2 flex items-center cursor-pointer hover:bg-emerald-50/40 transition-colors group/desc"
                                                        onClick={() => { setIsNewDetailComp(false); setDetailComp(comp); }}
                                                    >
                                                        <span className="truncate">{comp.materialName}</span>
                                                        <Settings2 className="w-3 h-3 text-slate-300 shrink-0 ml-1 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
                                                    </div>
                                                </td>

                                                <td className="border-r border-slate-200 text-center text-slate-500 px-1 whitespace-nowrap">{section}</td>

                                                {/* Inputs */}
                                                <td className="border-r border-slate-200 text-center p-0">
                                                    <NumberInput
                                                        cellMode
                                                        className="w-full h-full bg-transparent text-center outline-none"
                                                        value={comp.overrideHeight}
                                                        onChange={(val) =>
                                                            updateComp(assembly.id, comp.id, "overrideHeight", val)
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
                                                                updateComp(assembly.id, comp.id, 'usage', `Vertical @ ${val}" OC`);
                                                                updateComp(assembly.id, comp.id, 'ocSpacing', val ? `${val}"` : undefined);
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
                                                                updateComp(assembly.id, comp.id, "overrideLayers", val)
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
                                                        onChange={(val) => updateComp(assembly.id, comp.id, 'wasteFactor', val)}
                                                        placeholder="5"
                                                        scale={0.01} // Display as 5, save as 0.05
                                                    />
                                                </td>

                                                {/* Qty Column */}
                                                <td
                                                    className={[
                                                        'border-r border-slate-200 text-center font-bold px-1 p-0',
                                                        hasFormula ? 'cursor-pointer group' : '',
                                                    ].join(' ')}
                                                    onClick={hasFormula ? () => setFormulaEditState({ comp, openedFrom: 'qty', extractedDimensions: extractedDims }) : undefined}
                                                    title={hasFormula ? 'Click to edit formula' : undefined}
                                                >
                                                    {comp.usage === 'Fixed Qty' && !hasFormula ? (
                                                        <NumberInput cellMode
                                                            className="w-full h-full bg-transparent text-center outline-none font-bold"
                                                            value={comp.overrideQuantity}
                                                            onChange={(val) => updateComp(assembly.id, comp.id, 'overrideQuantity', val)}
                                                            placeholder={displayQty != null ? displayQty.toFixed(2) : '0.00'}
                                                        />
                                                    ) : (
                                                        <div className={[
                                                            'flex items-center justify-center gap-0.5 h-full px-1 relative',
                                                            hasFormula ? 'hover:bg-emerald-50 transition-colors rounded' : '',
                                                        ].join(' ')}>
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
                                                                        revertFormulaOverrides(
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

                                                {/* UOM — Qty MOU from material DB (ceiling vs wall), click to edit */}
                                                <td
                                                    className="border-r border-slate-200 text-center px-1 font-medium relative group/mou"
                                                    title={mat?.code ? 'Click to edit UOM' : undefined}
                                                >
                                                    {displayQty != null || hasFormula ? (
                                                        editingMouCell?.compId === comp.id && editingMouCell.type === 'qty' ? (
                                                            <input
                                                                autoFocus
                                                                className="w-full text-center text-xs border border-emerald-400 rounded outline-none px-1"
                                                                value={mouInputValue}
                                                                onChange={(e) => setMouInputValue(e.target.value)}
                                                                onBlur={() => {
                                                                    const original = (isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) || '';
                                                                    if (mouInputValue.trim() && mouInputValue.trim() !== original && mat?.code) {
                                                                        setPendingMouSave({
                                                                            materialCode: mat.code,
                                                                            materialName: mat.description || mat.code,
                                                                            field: isCeilingAssembly ? 'mouCeil' : 'mouWall',
                                                                            fieldLabel: 'UOM (Qty)',
                                                                            newValue: mouInputValue.trim(),
                                                                        });
                                                                    }
                                                                    setEditingMouCell(null);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                                    if (e.key === 'Escape') setEditingMouCell(null);
                                                                }}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                                onClick={() => {
                                                                    if (!mat?.code) return;
                                                                    const val = (isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) || getUnitSuffix(comp.selectedUnit || details.unit);
                                                                    setMouInputValue(val);
                                                                    setEditingMouCell({ compId: comp.id, type: 'qty' });
                                                                }}
                                                            >
                                                                <span>{(isCeilingAssembly ? mat?.mouCeil : mat?.mouWall) || getUnitSuffix(comp.selectedUnit || details.unit)}</span>
                                                                {mat?.code && <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou:opacity-100" />}
                                                                {hasMouQtyOverride && (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" title="UOM overridden for this project" />
                                                                )}
                                                            </div>
                                                        )
                                                    ) : '-'}
                                                </td>

                                                {/* Se.Qty */}
                                                <td
                                                    className={[
                                                        'border-r border-slate-200 text-center px-1',
                                                        hasFormula ? 'cursor-pointer group' : 'text-slate-600',
                                                    ].join(' ')}
                                                    onClick={hasFormula ? () => setFormulaEditState({ comp, openedFrom: 'seqty', extractedDimensions: extractedDims }) : undefined}
                                                    title={hasFormula ? 'Click to edit formula' : undefined}
                                                >
                                                    <div className={[
                                                        'flex items-center justify-center gap-0.5 h-full px-0.5',
                                                        hasFormula ? 'hover:bg-emerald-50 transition-colors rounded' : '',
                                                    ].join(' ')}>
                                                        <span className={hasFormula ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                                                            {displaySeQty != null
                                                                ? displaySeQty.toFixed(2)
                                                                : '-'}
                                                        </span>
                                                        {hasFormula && (
                                                            <FunctionSquare className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        )}
                                                    </div>
                                                </td>

                                                {/* MOU — Se.Qty MOU from material DB (ceiling vs wall), click to edit */}
                                                <td
                                                    className="border-r border-slate-200 text-center px-1 text-slate-600 truncate relative group/mou2"
                                                    title={mat?.code ? 'Click to edit Se.Qty UOM' : undefined}
                                                >
                                                    {displaySeQty != null ? (
                                                        editingMouCell?.compId === comp.id && editingMouCell.type === 'seqty' ? (
                                                            <input
                                                                autoFocus
                                                                className="w-full text-center text-xs border border-emerald-400 rounded outline-none px-1"
                                                                value={mouInputValue}
                                                                onChange={(e) => setMouInputValue(e.target.value)}
                                                                onBlur={() => {
                                                                    const original = (isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) || '';
                                                                    if (mouInputValue.trim() && mouInputValue.trim() !== original && mat?.code) {
                                                                        setPendingMouSave({
                                                                            materialCode: mat.code,
                                                                            materialName: mat.description || mat.code,
                                                                            field: isCeilingAssembly ? 'mouCeilSec' : 'mouWallSec',
                                                                            fieldLabel: 'UOM (Se.Qty)',
                                                                            newValue: mouInputValue.trim(),
                                                                        });
                                                                    }
                                                                    setEditingMouCell(null);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                                    if (e.key === 'Escape') setEditingMouCell(null);
                                                                }}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="flex items-center justify-center gap-0.5 cursor-pointer hover:bg-slate-100 rounded px-0.5"
                                                                onClick={() => {
                                                                    if (!mat?.code) return;
                                                                    const val = (isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) || mouVal;
                                                                    setMouInputValue(val);
                                                                    setEditingMouCell({ compId: comp.id, type: 'seqty' });
                                                                }}
                                                            >
                                                                <span>{(isCeilingAssembly ? mat?.mouCeilSec : mat?.mouWallSec) || mouVal}</span>
                                                                {mat?.code && <Edit2 className="w-2 h-2 text-slate-300 opacity-0 group-hover/mou2:opacity-100" />}
                                                                {hasMouSeQtyOverride && (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" title="Se.Qty UOM overridden for this project" />
                                                                )}
                                                            </div>
                                                        )
                                                    ) : '-'}
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
                                                                onChange={(val) => updateComp(assembly.id, comp.id, 'overrideMatCost', val)}
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

                        <div className="bg-slate-100 p-2 border-t border-slate-200 flex justify-end items-center gap-2">
                            {isDirty && onSaveAssembly && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    isLoading={isSavingAssembly}
                                    onClick={handleSaveClick}
                                >
                                    Save
                                </Button>
                            )}
                            <Button
                                variant={isDirty ? "ghost" : "primary"}
                                size="sm"
                                onClick={onClose}
                            >
                                {isDirty ? "Close without saving" : "Close"}
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
                        updateComp(assembly.id, debugComponent.comp.id, 'usage', 'Custom Formula');
                        updateComp(assembly.id, debugComponent.comp.id, 'customFormula', formula);
                    }}
                />
            )}

            {/* Render Formula Edit Modal */}
            {formulaEditState && (
                <FormulaEditModal
                    isOpen={true}
                    onClose={() => setFormulaEditState(null)}
                    component={formulaEditState.comp}
                    material={getMaterialByRowCode(formulaEditState.comp)}
                    assembly={assembly}
                    takeoffInstances={takeoffInstances}
                    openedFrom={formulaEditState.openedFrom}
                    extractedDimensions={formulaEditState.extractedDimensions}
                    onSaveFormulas={(overrides) => {
                        const comp = formulaEditState.comp;
                        const mat = getMaterialByRowCode(comp);
                        setFormulaEditState(null);

                        // Determine which formula fields actually changed from the DB baseline
                        const materialFieldUpdates: Partial<Pick<MaterialDefinition, 'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'>> = {};
                        if (overrides.formulaQtyOverride !== undefined && overrides.formulaQtyOverride !== '')
                            materialFieldUpdates.formulaQty = overrides.formulaQtyOverride;
                        if (overrides.formulaSecQtyOverride !== undefined && overrides.formulaSecQtyOverride !== '')
                            materialFieldUpdates.formulaSecQty = overrides.formulaSecQtyOverride;
                        if (overrides.formulaCeilQtyOverride !== undefined && overrides.formulaCeilQtyOverride !== '')
                            materialFieldUpdates.formulaCeilQty = overrides.formulaCeilQtyOverride;
                        if (overrides.formulaCeilSecQtyOverride !== undefined && overrides.formulaCeilSecQtyOverride !== '')
                            materialFieldUpdates.formulaCeilSecQty = overrides.formulaCeilSecQtyOverride;

                        const hasAnyChange = Object.keys(overrides).some(
                            (k) => overrides[k as keyof typeof overrides] !== undefined,
                        );
                        if (!hasAnyChange) return;

                        // If there are changes that differ from DB, show Local/Global dialog
                        const hasMaterialUpdate = Object.keys(materialFieldUpdates).length > 0;
                        if (hasMaterialUpdate && mat?.code) {
                            setPendingFormulaSave({
                                materialCode: mat.code,
                                materialName: mat.description || mat.code,
                                componentId: comp.id,
                                componentOverrides: overrides,
                                materialFieldUpdates,
                            });
                        } else {
                            // All changes are clearing overrides (empty string) — just save locally
                            if (overrides.formulaQtyOverride !== undefined)
                                updateComp(assembly.id, comp.id, 'formulaQtyOverride', overrides.formulaQtyOverride || undefined);
                            if (overrides.formulaSecQtyOverride !== undefined)
                                updateComp(assembly.id, comp.id, 'formulaSecQtyOverride', overrides.formulaSecQtyOverride || undefined);
                            if (overrides.formulaCeilQtyOverride !== undefined)
                                updateComp(assembly.id, comp.id, 'formulaCeilQtyOverride', overrides.formulaCeilQtyOverride || undefined);
                            if (overrides.formulaCeilSecQtyOverride !== undefined)
                                updateComp(assembly.id, comp.id, 'formulaCeilSecQtyOverride', overrides.formulaCeilSecQtyOverride || undefined);
                        }
                    }}
                />
            )}

            {/* Local / Global confirm dialog for formula saves */}
            <LocalGlobalConfirmModal
                isOpen={!!pendingFormulaSave}
                materialName={pendingFormulaSave?.materialName ?? ''}
                fieldLabel="Formula"
                isSaving={isSavingFormula}
                onLocal={applyFormulaLocal}
                onGlobal={applyFormulaGlobal}
                onCancel={() => setPendingFormulaSave(null)}
            />

            {/* Local / Global confirm dialog for MOU saves */}
            <LocalGlobalConfirmModal
                isOpen={!!pendingMouSave}
                materialName={pendingMouSave?.materialName ?? ''}
                fieldLabel={pendingMouSave?.fieldLabel ?? 'UOM'}
                isSaving={isSavingMou}
                onLocal={applyMouLocal}
                onGlobal={applyMouGlobal}
                onCancel={() => setPendingMouSave(null)}
            />

            {/* Render Component Detail Modal */}
            {detailComp && (
                <ComponentDetailModal
                    isOpen={true}
                    onClose={() => {
                        setDetailComp(null);
                        setIsNewDetailComp(false);
                    }}
                    component={detailComp}
                    material={getMaterialByRowCode(detailComp)}
                    assemblyId={assembly.id}
                    onUpdateField={updateComp}
                    onSelectMaterial={handleMaterialSelect}
                    materials={materials}
                    isLabor={getIsLaborRow(detailComp)}
                    isNewComponent={isNewDetailComp}
                    onDeleteComponent={handleDeleteComponent}
                />
            )}
        </Modal>
    );
};

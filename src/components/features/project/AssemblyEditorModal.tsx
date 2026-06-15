'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AssemblyComponent, MaterialDefinition, WallAssembly } from '@/types';
import { AppWindow } from 'lucide-react';
import { DEFAULT_TEMPLATES, AssemblyTemplate } from '@/constants/defaultAssemblies';
import { CloseButton, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { FormulaDebugModal } from '@/components/features/project/FormulaDebugModal';
import { FormulaEditModal } from '@/components/features/project/FormulaEditModal';
import { LocalGlobalConfirmModal } from '@/components/features/project/LocalGlobalConfirmModal';
import { AssemblyEditorSidebar } from './AssemblyEditorSidebar';
import { type ExtractedDimensions } from '@/lib/utils/formulaEvaluator';
import { MaterialCosting } from '@/types/assembly';
import type { ProjectOverrideMap, OverrideableField } from '@/types/core/projectOverrides';
import {
    applyProjectOverrideUpdates,
    removeProjectOverrideFields,
} from '@/lib/utils/projectOverrideState';
import { ComponentDetailModal } from './editor-tabs/ComponentDetailModal';
import { ComponentsList, PendingMouSaveData } from './editor-tabs/ComponentsList';
import {
    getMaterialByRowCode,
    getIsLaborRow,
    getRowTotalCost,
} from './editor-tabs/assemblyComponentHelpers';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssemblyEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    assembly: WallAssembly;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateAssemblyInfo: (id: string, field: keyof WallAssembly, value: any) => void;
    totalAggLength: number;
    materials: MaterialDefinition[];
    handleMaterialSelect: (assemblyId: string, componentId: string, material: MaterialDefinition) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleUpdateComponent: (assemblyId: string, componentId: string, field: keyof AssemblyComponent, value: any) => void;
    handleAddComponent: (assemblyId: string) => void;
    handleDeleteComponent: (assemblyId: string, componentId: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRowDetails: (comp: AssemblyComponent, assembly: WallAssembly, instances: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    takeoffInstances: any[];
    statsByHeight: Record<string, { len: number; area: number; perim?: number }>;
    selectedHeight: number | null;
    onSelectHeight: (height: number | null) => void;
    onLoadTemplate?: (template: AssemblyTemplate) => void;
    templates?: AssemblyTemplate[];
    materialCostingData?: MaterialCosting;
    projectId?: string | null;
    overrideMap?: ProjectOverrideMap;
    onOverrideMapChange?: (updater: (prev: ProjectOverrideMap) => ProjectOverrideMap) => void;
    onSaveAssembly?: (assembly: WallAssembly) => Promise<void>;
    onWasteChange?: (code: string, wastePercent: number, isLabor: boolean) => void;
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface FormulaEditState {
    comp: AssemblyComponent;
    openedFrom: 'qty' | 'seqty';
    extractedDimensions?: ExtractedDimensions;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AssemblyEditorModal: React.FC<AssemblyEditorModalProps> = ({
    isOpen,
    onClose,
    assembly,
    updateAssemblyInfo,
    totalAggLength,
    materials,
    handleMaterialSelect,
    handleUpdateComponent,
    handleAddComponent,
    handleDeleteComponent,
    getRowDetails,
    takeoffInstances,
    statsByHeight,
    selectedHeight,
    onSelectHeight,
    onLoadTemplate,
    templates = DEFAULT_TEMPLATES,
    materialCostingData,
    projectId,
    overrideMap = {},
    onOverrideMapChange,
    onSaveAssembly,
    onWasteChange,
}) => {
    const toast = useToast();

    // ── Assembly edit state ──
    const [tempAssembly, setTempAssembly] = useState(assembly);
    const [isDirty, setIsDirty] = useState(false);
    const [isSavingAssembly, setIsSavingAssembly] = useState(false);

    // ── Sub-modal state ──
    const [debugComponent, setDebugComponent] = useState<{
        comp: AssemblyComponent;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vars: any;
    } | null>(null);
    const [formulaEditState, setFormulaEditState] = useState<FormulaEditState | null>(null);
    const [detailComp, setDetailComp] = useState<AssemblyComponent | null>(null);
    const [isNewDetailComp, setIsNewDetailComp] = useState(false);

    // ── Formula Local/Global save state ──
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
        materialFieldUpdates: Partial<
            Pick<MaterialDefinition, 'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'>
        >;
    } | null>(null);
    const [isSavingFormula, setIsSavingFormula] = useState(false);

    // ── MOU Local/Global save state ──
    const [pendingMouSave, setPendingMouSave] = useState<PendingMouSaveData | null>(null);
    const [isSavingMou, setIsSavingMou] = useState(false);

    // Sync tempAssembly when assembly prop changes
    useEffect(() => {
        setTempAssembly(assembly);
    }, [assembly]);

    // Marks the assembly dirty and delegates the field update to the parent.
    // For wasteFactor changes also notifies parent to refresh materialCostingData
    // (local UI refresh only — no DB write; Save button handles persistence).
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

    const handleSaveClick = useCallback(async () => {
        if (!onSaveAssembly) return;
        setIsSavingAssembly(true);
        try {
            await onSaveAssembly(assembly);
            setIsDirty(false);
            toast.success('Assembly saved');
        } catch (err) {
            console.error('[Save] ❌ onSaveAssembly rejected:', err);
            toast.error('Failed to save assembly');
        } finally {
            setIsSavingAssembly(false);
        }
    }, [onSaveAssembly, assembly, toast]);

    // Open the detail modal for the last-added component (one-shot after add)
    const prevCompCountRef = useRef(assembly.components.length);
    useEffect(() => {
        if (isNewDetailComp && assembly.components.length > prevCompCountRef.current) {
            const lastComp = assembly.components[assembly.components.length - 1];
            setDetailComp(lastComp);
            prevCompCountRef.current = assembly.components.length;
        } else {
            prevCompCountRef.current = assembly.components.length;
        }
    }, [isNewDetailComp, assembly.components]);

    // ── Formula Local/Global handlers ──────────────────────────────────────────

    const applyFormulaLocal = useCallback(async () => {
        if (!pendingFormulaSave || !projectId) return;
        const { materialCode, materialFieldUpdates } = pendingFormulaSave;
        setIsSavingFormula(true);
        try {
            const updates = Object.entries(materialFieldUpdates).map(([field, value]) => ({
                field: field as OverrideableField,
                value,
            }));
            if (updates.length === 0) { setPendingFormulaSave(null); return; }
                const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                body: JSON.stringify({ materialCode, updates }),
                });
                const json = await res.json();
                if (!json.success) { toast.error(json.error ?? 'Failed to save override'); return; }
            onOverrideMapChange?.((prev) =>
                applyProjectOverrideUpdates(prev, materialCode, updates),
            );
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
        const { materialCode, componentId, componentOverrides, materialFieldUpdates } =
            pendingFormulaSave;
        if (Object.keys(materialFieldUpdates).length === 0) {
            setPendingFormulaSave(null);
            return;
        }
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
                const overrideKeyMap: Record<string, keyof AssemblyComponent> = {
                    formulaQty: 'formulaQtyOverride',
                    formulaSecQty: 'formulaSecQtyOverride',
                    formulaCeilQty: 'formulaCeilQtyOverride',
                    formulaCeilSecQty: 'formulaCeilSecQtyOverride',
                };
                (
                    Object.keys(materialFieldUpdates) as Array<keyof typeof materialFieldUpdates>
                ).forEach((f) => {
                    const cf = overrideKeyMap[f];
                    if (cf && componentOverrides[cf as keyof typeof componentOverrides] !== undefined) {
                        updateComp(assembly.id, componentId, cf, undefined);
                    }
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
    }, [pendingFormulaSave, assembly.id, updateComp, toast]);

    const revertFormulaOverrides = useCallback(
        async (materialCode: string, fields: OverrideableField[]) => {
        if (!projectId) return;
        try {
                const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ materialCode, fields }),
                });
                const json = await res.json();
                if (!json.success) { toast.error(json.error ?? 'Failed to revert'); return; }
                onOverrideMapChange?.((prev) =>
                    removeProjectOverrideFields(prev, materialCode, fields),
                );
            toast.success('Reverted to database value');
        } catch {
            toast.error('Failed to revert');
        }
        },
        [projectId, onOverrideMapChange, toast],
    );

    // ── MOU Local/Global handlers ──────────────────────────────────────────────

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
                onOverrideMapChange?.((prev) =>
                    applyProjectOverrideUpdates(prev, pendingMouSave.materialCode, [
                        { field: pendingMouSave.field, value: pendingMouSave.newValue },
                    ]),
                );
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
            const res = await fetch(
                `/api/materials/${encodeURIComponent(pendingMouSave.materialCode)}`,
                {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ [pendingMouSave.field]: pendingMouSave.newValue }),
                },
            );
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

    // ── Totals (for header bar + sidebar) ─────────────────────────────────────

    let totalCost = 0;
    let totalLaborCost = 0;
    let totalMaterialCost = 0;
    assembly.components.forEach((comp) => {
        const rowTotal = getRowTotalCost(
            comp,
            assembly,
            materials,
            takeoffInstances,
            materialCostingData,
            getRowDetails,
        );
        totalCost += rowTotal;
        if (getIsLaborRow(comp, materials)) totalLaborCost += rowTotal;
        else totalMaterialCost += rowTotal;
    });

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            closeOnOverlayClick={false}
            showCloseButton={false}
        >
            <div className="bg-white w-full h-[95vh] flex flex-col overflow-hidden">
                {/* Header bar */}
                <div className="bg-blue-600 text-white px-6 py-3 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <AppWindow className="w-6 h-6" />
                        Edit Assembly: {assembly.code}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-xs opacity-80 uppercase tracking-widest">
                                Total cost
                        </div>
                            <div className="text-2xl font-bold font-mono leading-none">
                                ${Number.isFinite(totalCost)
                                    ? totalCost.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })
                                    : '0.00'}
                            </div>
                        </div>
                        <CloseButton onClick={onClose} size="md" variant="light" />
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left sidebar */}
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

                    {/* Right panel — components table */}
                    <div className="flex-1 flex flex-col bg-white min-w-0">
                        <ComponentsList
                            assembly={assembly}
                            materials={materials}
                            takeoffInstances={takeoffInstances}
                            materialCostingData={materialCostingData}
                            overrideMap={overrideMap}
                            getRowDetails={getRowDetails}
                            onUpdateComp={updateComp}
                            onDeleteComponent={handleDeleteComponent}
                            onAddComponent={(assemblyId) => {
                                handleAddComponent(assemblyId);
                                    setIsNewDetailComp(true);
                                }}
                            onFormulaClick={(comp, from, extDims) =>
                                setFormulaEditState({
                                    comp,
                                    openedFrom: from,
                                    extractedDimensions: extDims,
                                })
                            }
                            onOpenDetail={(comp, isNew) => {
                                setIsNewDetailComp(isNew);
                                setDetailComp(comp);
                            }}
                            onMouSavePending={setPendingMouSave}
                            onRevertFormulaOverrides={revertFormulaOverrides}
                            isDirty={isDirty}
                            isSavingAssembly={isSavingAssembly}
                            onSaveClick={handleSaveClick}
                            onClose={onClose}
                        />
                                                        </div>
                                                            </div>
                                                    </div>

            {/* Formula Debug Modal */}
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

            {/* Formula Edit Modal */}
            {formulaEditState && (
                <FormulaEditModal
                    isOpen={true}
                    onClose={() => setFormulaEditState(null)}
                    component={formulaEditState.comp}
                    material={getMaterialByRowCode(formulaEditState.comp, materials)}
                    assembly={assembly}
                    takeoffInstances={takeoffInstances}
                    openedFrom={formulaEditState.openedFrom}
                    extractedDimensions={formulaEditState.extractedDimensions}
                    onSaveFormulas={(overrides) => {
                        const comp = formulaEditState.comp;
                        const mat = getMaterialByRowCode(comp, materials);
                        setFormulaEditState(null);

                        // Apply variable value overrides immediately to component fields.
                        // These map to existing component override fields and are persisted
                        // to final_outputs via the assembly Save button.
                        if (overrides.varOverrides) {
                            const vov = overrides.varOverrides;
                            if (vov.Length != null) updateComp(assembly.id, comp.id, 'lengthOverride', vov.Length);
                            if (vov.Height != null) updateComp(assembly.id, comp.id, 'overrideHeight', vov.Height);
                            if (vov.Wastage != null) updateComp(assembly.id, comp.id, 'wasteFactor', vov.Wastage);
                            if (vov.layer != null) updateComp(assembly.id, comp.id, 'overrideLayers', Math.round(vov.layer));
                            if (vov.OC != null) updateComp(assembly.id, comp.id, 'ocSpacing', String(Math.round(vov.OC)));
                        }

                        const materialFieldUpdates: Partial<
                            Pick<
                                MaterialDefinition,
                                'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'
                            >
                        > = {};
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

            {/* Local / Global confirm — formula saves */}
            <LocalGlobalConfirmModal
                isOpen={!!pendingFormulaSave}
                materialName={pendingFormulaSave?.materialName ?? ''}
                fieldLabel="Formula"
                isSaving={isSavingFormula}
                onLocal={applyFormulaLocal}
                onGlobal={applyFormulaGlobal}
                onCancel={() => setPendingFormulaSave(null)}
            />

            {/* Local / Global confirm — MOU saves */}
            <LocalGlobalConfirmModal
                isOpen={!!pendingMouSave}
                materialName={pendingMouSave?.materialName ?? ''}
                fieldLabel={pendingMouSave?.fieldLabel ?? 'UOM'}
                isSaving={isSavingMou}
                onLocal={applyMouLocal}
                onGlobal={applyMouGlobal}
                onCancel={() => setPendingMouSave(null)}
            />

            {/* Component Detail Modal */}
            {detailComp && (
                <ComponentDetailModal
                    isOpen={true}
                    onClose={() => {
                        setDetailComp(null);
                        setIsNewDetailComp(false);
                    }}
                    component={detailComp}
                    material={getMaterialByRowCode(detailComp, materials)}
                    assemblyId={assembly.id}
                    onUpdateField={updateComp}
                    onSelectMaterial={handleMaterialSelect}
                    materials={materials}
                    isLabor={getIsLaborRow(detailComp, materials)}
                    isNewComponent={isNewDetailComp}
                    onDeleteComponent={handleDeleteComponent}
                />
            )}
        </Modal>
    );
};

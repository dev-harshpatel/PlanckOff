'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calculator, FlaskConical, Save, RotateCcw, ChevronRight } from 'lucide-react';
import {
    AssemblyComponent,
    MaterialDefinition,
    WallAssembly,
    TakeoffInstance,
} from '@/types';
import {
    FORMULA_VAR_DEFINITIONS,
    FormulaVarDef,
    buildFormulaVarMap,
    evaluateMaterialFormula,
    getActiveFormulaVars,
    parsePackageSize,
    normalizeFormula,
    type ExtractedDimensions,
} from '@/lib/utils/formulaEvaluator';
import { getWasteFactor } from '@/constants';
import { Modal, Button } from '@/components/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FormulaEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    component: AssemblyComponent;
    material: MaterialDefinition | undefined;
    assembly: WallAssembly;
    takeoffInstances: TakeoffInstance[];
    /** Which column was clicked — determines the default active tab */
    openedFrom: 'qty' | 'seqty';
    /**
     * Dimensions from the final_output extracted_material for this material/assembly.
     * When provided, Length/Height/CeilingArea variables use these values instead of
     * aggregating from takeoff instances — keeps formulas consistent with the stored output.
     */
    extractedDimensions?: ExtractedDimensions;
    onSaveFormulas: (overrides: {
        formulaQtyOverride?: string;
        formulaSecQtyOverride?: string;
        formulaCeilQtyOverride?: string;
        formulaCeilSecQtyOverride?: string;
        /** Variable values the user changed in the editor — map to component override fields */
        varOverrides?: Record<string, number>;
    }) => void;
}

type FormulaType = 'wall' | 'ceiling';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: aggregate context
// ─────────────────────────────────────────────────────────────────────────────

function buildContextVarMap(
    comp: AssemblyComponent,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
    material: MaterialDefinition | undefined,
    extractedDimensions?: ExtractedDimensions,
): Record<string, number> {
    let totalLinearFeet: number;
    let avgHeight: number;
    let totalCeilingArea: number;
    let totalPerimeter: number;
    let baseLayers: number;

    // Always aggregate from takeoff instances for height, ceilingArea, perimeter
    {
        const hMin = comp.heightCondition?.min ?? 0;
        const hMax = comp.heightCondition?.max ?? Infinity;
        let totalWallArea = 0;
        totalLinearFeet  = 0;
        totalCeilingArea = 0;
        totalPerimeter   = 0;
        avgHeight        = 0;
        baseLayers       = 1;

        instances.forEach(inst => {
            const qty = inst.quantity || 1;
            const isCeilingInst = (inst.ceilingArea || 0) > 0;
            const rawH = inst.height || 0;
            const h = (!isCeilingInst && rawH === 0 && assembly.defaultHeight)
                ? assembly.defaultHeight : rawH;
            const effectiveH = Math.max(0, Math.min(hMax, h) - hMin);
            totalCeilingArea += (inst.ceilingArea || 0) * qty;
            if (isCeilingInst) totalPerimeter += (inst.perimeter || inst.length || 0) * qty;
            if (effectiveH > 0) {
                totalLinearFeet += (inst.length || 0) * qty;
                totalWallArea   += (inst.length || 0) * effectiveH * qty;
            }
        });

        if (instances.length === 0) {
            if (assembly.assemblyType === 'Ceiling') {
                totalCeilingArea = assembly.defaultArea || 0;
                totalPerimeter   = assembly.defaultPerimeter || 0;
            } else {
                const defH = assembly.defaultHeight || 0;
                const effectiveH = Math.max(0, Math.min(hMax, defH) - (comp.heightCondition?.min ?? 0));
                if (effectiveH > 0) {
                    totalLinearFeet = assembly.defaultLength || 0;
                    avgHeight = effectiveH;
                }
            }
        } else if (totalLinearFeet > 0) {
            avgHeight = totalWallArea / totalLinearFeet;
        }
    }

    // Length: comp override > total_length from final_output > aggregated from takeoff
    if (comp.lengthOverride != null) {
        totalLinearFeet = comp.lengthOverride;
    } else if (extractedDimensions?.totalLength) {
        totalLinearFeet = extractedDimensions.totalLength;
    }

    const calcHeight = comp.overrideHeight ?? avgHeight;
    const layers = comp.overrideLayers ?? baseLayers;
    const wastage = comp.wasteFactor != null ? comp.wasteFactor : getWasteFactor(material?.category || 'Other');
    const ocMatch = (comp.ocSpacing || comp.usage).match(/(\d+)/);
    const oc = ocMatch ? parseInt(ocMatch[1]) : 16;
    const packageSize = parsePackageSize(material?.sheetBagBox);
    const areaCover = material?.lengthCover ? parseFloat(material.lengthCover) || 0 : 0;

    return buildFormulaVarMap({
        length: totalLinearFeet,
        height: calcHeight,
        ceilingArea: totalCeilingArea,
        perimeter: totalPerimeter,
        wastage,
        layers,
        oc,
        packageSize,
        areaCover,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface FormulaPaneProps {
    label: string;
    formula: string;
    onFormulaChange: (val: string) => void;
    baseFormula: string;        // From material DB (read-only reference)
    varValues: Record<string, number>;
    onVarChange: (key: string, val: number) => void;
    isActive: boolean;          // Whether this is the "focused" pane
    onClick: () => void;
}

const FormulaPane: React.FC<FormulaPaneProps> = ({
    label, formula, onFormulaChange, baseFormula,
    varValues, onVarChange, isActive, onClick,
}) => {
    const activeVars = useMemo(() => getActiveFormulaVars(formula || baseFormula), [formula, baseFormula]);
    const result = useMemo(() => evaluateMaterialFormula(formula, varValues), [formula, varValues]);
    // "Override" = user changed an existing DB formula. "New" = user added where none existed.
    const isChanged = formula !== baseFormula && formula !== '';
    const isOverride = isChanged && baseFormula !== '';
    const isNew = isChanged && baseFormula === '';
    const isEmpty = !formula && !baseFormula;

    return (
        <div
            className={[
                'flex-1 min-w-0 flex flex-col rounded-xl border-2 transition-all cursor-default',
                isActive
                    ? 'border-emerald-400 shadow-md shadow-emerald-100'
                    : 'border-slate-200 hover:border-slate-300',
            ].join(' ')}
            onClick={onClick}
        >
            {/* Pane Header */}
            <div className={[
                'flex items-center justify-between px-4 py-2.5 rounded-t-[10px] border-b',
                isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200',
            ].join(' ')}>
                <div className="flex items-center gap-2">
                    <Calculator className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">{label}</span>
                    {isOverride && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wide">
                            Override
                        </span>
                    )}
                    {isNew && (
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-wide">
                            New
                        </span>
                    )}
                </div>
                {result !== null && (
                    <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        = {result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                )}
            </div>

            {/* Scrollable content — textarea + variables */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                {/* Formula Textarea */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Expression
                        </label>
                        {baseFormula && formula !== baseFormula && formula !== '' && (
                            <button
                                type="button"
                                className="text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 underline underline-offset-2"
                                onClick={(e) => { e.stopPropagation(); onFormulaChange(baseFormula); }}
                            >
                                <RotateCcw className="w-2.5 h-2.5" />
                                Reset to default
                            </button>
                        )}
                    </div>
                    <textarea
                        className={[
                            'w-full px-3 py-2.5 rounded-lg font-mono text-xs resize-none',
                            'border focus:outline-none focus:ring-2 focus:ring-emerald-400',
                            'transition-colors leading-relaxed',
                            isActive
                                ? 'bg-slate-900 text-emerald-300 border-slate-700 placeholder-slate-600'
                                : 'bg-slate-800 text-slate-400 border-slate-700 placeholder-slate-600',
                        ].join(' ')}
                        rows={3}
                        placeholder={isEmpty ? 'No formula defined...' : baseFormula || 'Enter formula expression...'}
                        value={formula}
                        onChange={e => onFormulaChange(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        spellCheck={false}
                    />
                    {/* DB formula hint when override is active */}
                    {isOverride && baseFormula && (
                        <div className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] text-slate-400 font-mono border border-slate-100">
                            <span className="font-bold text-slate-500">DB: </span>{baseFormula}
                        </div>
                    )}
                </div>

                {/* Variables */}
                {activeVars.length > 0 && (
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Variables in Use
                        </div>
                        <div className="space-y-1.5">
                            {activeVars.map(varDef => (
                                <VarRow
                                    key={varDef.key}
                                    varDef={varDef}
                                    value={varValues[varDef.key] ?? 0}
                                    onChange={val => onVarChange(varDef.key, val)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {isEmpty && (
                    <div className="flex items-center justify-center py-8">
                        <div className="text-center text-slate-400">
                            <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-xs">No formula in database</p>
                            <p className="text-[11px] mt-0.5 text-slate-300">Type an expression above to add one</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Computed Result — always pinned at bottom of pane */}
            {!isEmpty && (
                <div className="shrink-0 px-4 pb-4 pt-0">
                    <div className={[
                        'flex items-center justify-between rounded-lg px-3 py-2.5 border',
                        result !== null
                            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100'
                            : 'bg-slate-50 border-slate-200',
                    ].join(' ')}>
                        <span className="text-xs text-slate-500 font-medium">Computed Result</span>
                        <div className="flex items-center gap-1.5">
                            <ChevronRight className={`w-3 h-3 ${result !== null ? 'text-emerald-500' : 'text-slate-300'}`} />
                            {result !== null ? (
                                <span className="font-bold font-mono text-emerald-700 text-sm">
                                    {result >= 10
                                        ? result.toLocaleString(undefined, { maximumFractionDigits: 0 })
                                        : result.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                </span>
                            ) : (
                                <span className="font-mono text-slate-400 text-sm">—</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface VarRowProps {
    varDef: FormulaVarDef;
    value: number;
    onChange: (val: number) => void;
}

const VarRow: React.FC<VarRowProps> = ({ varDef, value, onChange }) => {
    const [inputVal, setInputVal] = useState(String(value));

    useEffect(() => {
        setInputVal(String(value));
    }, [value]);

    const handleBlur = () => {
        const parsed = parseFloat(inputVal);
        if (!isNaN(parsed)) onChange(parsed);
        else setInputVal(String(value));
    };

    return (
        <div className="flex items-center gap-2 text-xs">
            <div className="w-28 min-w-0 truncate">
                <span className="font-mono text-slate-600 text-[11px]">{varDef.displayName}</span>
                {varDef.unit && (
                    <span className="ml-1 text-[9px] text-slate-400 uppercase">{varDef.unit}</span>
                )}
            </div>
            <input
                type="text"
                inputMode="decimal"
                className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-200 bg-white font-mono text-[11px] text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 hover:border-slate-300 transition-colors"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onBlur={handleBlur}
                title={varDef.description}
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main modal component
// ─────────────────────────────────────────────────────────────────────────────

export const FormulaEditModal: React.FC<FormulaEditModalProps> = ({
    isOpen,
    onClose,
    component,
    material,
    assembly,
    takeoffInstances,
    openedFrom,
    extractedDimensions,
    onSaveFormulas,
}) => {
    const isCeilingAssembly = assembly.assemblyType === 'Ceiling';

    // Active type tab: default to assembly type, but user can switch
    const [activeType, setActiveType] = useState<FormulaType>(
        isCeilingAssembly ? 'ceiling' : 'wall',
    );

    // Which pane is focused (for styling)
    const [focusedPane, setFocusedPane] = useState<'qty' | 'seqty'>(openedFrom);

    // Formula strings (editable)
    const [wallQty, setWallQty] = useState('');
    const [wallSeQty, setWallSeQty] = useState('');
    const [ceilQty, setCeilQty] = useState('');
    const [ceilSeQty, setCeilSeQty] = useState('');

    // Variable values (editable for live preview)
    const [varValues, setVarValues] = useState<Record<string, number>>({});
    // Snapshot of varValues when the modal opened — used to detect user changes on save
    const initialVarValuesRef = useRef<Record<string, number>>({});

    // DB formula baseline (read-only reference)
    const dbFormulas = useMemo(() => ({
        wallQty:    material?.formulaQty       || '',
        wallSeQty:  material?.formulaSecQty    || '',
        ceilQty:    material?.formulaCeilQty   || '',
        ceilSeQty:  material?.formulaCeilSecQty || '',
    }), [material]);

    // Reset state when component changes or modal opens
    useEffect(() => {
        if (!isOpen) return;
        setActiveType(isCeilingAssembly ? 'ceiling' : 'wall');
        setFocusedPane(openedFrom);
        setWallQty(component.formulaQtyOverride ?? material?.formulaQty ?? '');
        setWallSeQty(component.formulaSecQtyOverride ?? material?.formulaSecQty ?? '');
        setCeilQty(component.formulaCeilQtyOverride ?? material?.formulaCeilQty ?? '');
        setCeilSeQty(component.formulaCeilSecQtyOverride ?? material?.formulaCeilSecQty ?? '');
        const initialVars = buildContextVarMap(component, assembly, takeoffInstances, material, extractedDimensions);
        setVarValues(initialVars);
        initialVarValuesRef.current = initialVars;
    }, [isOpen, component, material]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleVarChange = useCallback((key: string, val: number) => {
        setVarValues(prev => ({ ...prev, [key]: val }));
    }, []);

    const handleSave = () => {
        // For each formula field:
        //   • If changed from DB default → save as override
        //   • If matches DB default AND an existing override was set → send '' to clear it
        //   • If matches DB default AND no existing override → send undefined (no-op)
        const resolveOverride = (
            current: string,
            dbDefault: string,
            existing: string | undefined,
        ): string | undefined => {
            if (current !== dbDefault) return current;          // new/changed value
            if (existing !== undefined) return '';              // clear stale override
            return undefined;                                   // no change needed
        };

        // Collect variable values that the user changed from their initial (project) values
        const varOverrides: Record<string, number> = {};
        const initial = initialVarValuesRef.current;
        for (const key of Object.keys(varValues)) {
            if (varValues[key] !== initial[key]) {
                varOverrides[key] = varValues[key];
            }
        }

        onSaveFormulas({
            formulaQtyOverride:        resolveOverride(wallQty,   dbFormulas.wallQty,   component.formulaQtyOverride),
            formulaSecQtyOverride:     resolveOverride(wallSeQty, dbFormulas.wallSeQty, component.formulaSecQtyOverride),
            formulaCeilQtyOverride:    resolveOverride(ceilQty,   dbFormulas.ceilQty,   component.formulaCeilQtyOverride),
            formulaCeilSecQtyOverride: resolveOverride(ceilSeQty, dbFormulas.ceilSeQty, component.formulaCeilSecQtyOverride),
            ...(Object.keys(varOverrides).length > 0 && { varOverrides }),
        });
        onClose();
    };

    const handleReset = () => {
        setWallQty(dbFormulas.wallQty);
        setWallSeQty(dbFormulas.wallSeQty);
        setCeilQty(dbFormulas.ceilQty);
        setCeilSeQty(dbFormulas.ceilSeQty);
    };

    const hasAnyOverride =
        wallQty    !== (component.formulaQtyOverride       ?? dbFormulas.wallQty)   ||
        wallSeQty  !== (component.formulaSecQtyOverride    ?? dbFormulas.wallSeQty)  ||
        ceilQty    !== (component.formulaCeilQtyOverride   ?? dbFormulas.ceilQty)    ||
        ceilSeQty  !== (component.formulaCeilSecQtyOverride ?? dbFormulas.ceilSeQty);

    const activeQtyFormula   = activeType === 'wall' ? wallQty   : ceilQty;
    const activeSeQtyFormula = activeType === 'wall' ? wallSeQty : ceilSeQty;
    const setActiveQty       = activeType === 'wall' ? setWallQty   : setCeilQty;
    const setActiveSeQty     = activeType === 'wall' ? setWallSeQty : setCeilSeQty;
    const dbQty              = activeType === 'wall' ? dbFormulas.wallQty   : dbFormulas.ceilQty;
    const dbSeQty            = activeType === 'wall' ? dbFormulas.wallSeQty : dbFormulas.ceilSeQty;

    const materialCode = component.materialCode || material?.code || '';
    const materialName = component.materialName || material?.description || 'Unknown Material';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="2xl"
            closeOnOverlayClick={false}
            showCloseButton={false}
        >
            {/* Custom Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-start justify-between rounded-t-xl">
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 rounded bg-emerald-500/20 border border-emerald-500/40">
                            <Calculator className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-sm font-bold text-white">Formula Editor</span>
                        {materialCode && (
                            <span className="text-[10px] font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600">
                                {materialCode}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 truncate ml-9">{materialName}</p>
                </div>

                {/* Wall / Ceiling Toggle */}
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700 shrink-0 ml-4">
                    {(['wall', 'ceiling'] as FormulaType[]).map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setActiveType(type)}
                            className={[
                                'px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize',
                                activeType === type
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200',
                            ].join(' ')}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="p-4 bg-slate-50">
                {/* Context info bar */}
                <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700 uppercase tracking-wide">
                        {activeType === 'wall' ? 'Wall Formulas' : 'Ceiling Formulas'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>Assembly: <span className="font-semibold text-slate-700">{assembly.code}</span></span>
                    <span className="text-slate-300">|</span>
                    <span>Type: <span className="font-semibold text-slate-700">{assembly.assemblyType || 'Wall'}</span></span>
                    {material?.sheetBagBox && (
                        <>
                            <span className="text-slate-300">|</span>
                            <span>Pkg Size: <span className="font-semibold text-slate-700">{material.sheetBagBox}</span></span>
                        </>
                    )}
                </div>

                {/* Two-pane formula editor */}
                <div className="flex gap-3 h-[580px]">
                    <FormulaPane
                        label="Qty. Formula"
                        formula={activeQtyFormula}
                        onFormulaChange={setActiveQty}
                        baseFormula={dbQty}
                        varValues={varValues}
                        onVarChange={handleVarChange}
                        isActive={focusedPane === 'qty'}
                        onClick={() => setFocusedPane('qty')}
                    />
                    <FormulaPane
                        label="Se.Qty. Formula"
                        formula={activeSeQtyFormula}
                        onFormulaChange={setActiveSeQty}
                        baseFormula={dbSeQty}
                        varValues={varValues}
                        onVarChange={handleVarChange}
                        isActive={focusedPane === 'seqty'}
                        onClick={() => setFocusedPane('seqty')}
                    />
                </div>

                {/* Formula syntax hint */}
                <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 text-[10px] text-blue-600">
                    <span className="font-bold">Tip:</span> Use variable names like{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">Length</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">Height</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">Wastage</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">layer</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">sheet area</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">bag size</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">Ceiling Area</code>,{' '}
                    <code className="font-mono bg-blue-100 px-1 rounded">AREA COVER</code> — operators: <code className="font-mono bg-blue-100 px-1 rounded">+ - * / ( )</code>
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between rounded-b-xl">
                <div className="flex items-center gap-2">
                    {hasAnyOverride && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={RotateCcw}
                            onClick={handleReset}
                        >
                            Reset All
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        icon={Save}
                        onClick={handleSave}
                    >
                        Apply Formula
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

/**
 * Formula Evaluator Utilities
 *
 * Handles evaluation of material quantity formulas from the database.
 * Supports multi-word variable names like "sheet area", "bag size", "Ceiling Area".
 */

import { WallAssembly, AssemblyComponent, MaterialDefinition, TakeoffInstance } from '@/types';
import { evaluateMath } from '@/services/gemini/client';
import { getWasteFactor } from '@/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Multi-word variable normalizations (formula text → single identifier)
// ─────────────────────────────────────────────────────────────────────────────

const MULTI_WORD_NORMALIZATIONS: [RegExp, string][] = [
    // Unicode math symbols → ASCII operators (must run before multi-word replacements)
    [/×/g, '*'],
    [/÷/g, '/'],
    [/ceiling\s+area/gi, 'CeilingArea'],
    [/sheet\s+area/gi, 'SheetArea'],
    [/bag\s+size/gi, 'BagSize'],
    [/size\s+of\s+bucket/gi, 'BagSize'],
    [/area\s+cover/gi, 'AreaCover'],
    [/length\s+cover/gi, 'AreaCover'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Variable Definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface FormulaVarDef {
    /** Human-readable name as it appears in formula strings */
    displayName: string;
    /** Internal key used in the variable map */
    key: string;
    /** Display unit label */
    unit: string;
    /** Tooltip / help text */
    description: string;
}

/** All known variables that can appear in material formulas */
export const FORMULA_VAR_DEFINITIONS: FormulaVarDef[] = [
    { displayName: 'Length',       key: 'Length',      unit: 'LF',  description: 'Total wall length in linear feet' },
    { displayName: 'Height',       key: 'Height',      unit: 'ft',  description: 'Wall / panel height in feet' },
    { displayName: 'Wastage',      key: 'Wastage',     unit: '',    description: 'Waste factor as decimal (0.05 = 5%)' },
    { displayName: 'layer',        key: 'layer',       unit: 'ea',  description: 'Number of layers applied' },
    { displayName: 'sheet area',   key: 'SheetArea',   unit: 'SF',  description: 'Sheet / panel area in sq ft' },
    { displayName: 'size', key: 'BagSize', unit: '', description: 'Bag / box / bucket size from material database' },
    { displayName: 'Ceiling Area', key: 'CeilingArea', unit: 'SF',  description: 'Total ceiling area in sq ft' },
    { displayName: 'OC',           key: 'OC',          unit: '"',   description: 'On-center stud spacing in inches' },
    { displayName: 'Perimeter',    key: 'Perimeter',   unit: 'LF',  description: 'Room / ceiling perimeter in linear feet' },
    { displayName: 'AREA COVER',   key: 'AreaCover',   unit: '',    description: 'Area / length cover from material database' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a package size string to a numeric area/count.
 *  "2x8" → 16   "4x12" → 48   "95" → 95
 */
export function parsePackageSize(sizeStr: string | undefined): number {
    if (!sizeStr) return 0;
    const clean = sizeStr.trim();
    const dimMatch = clean.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
    if (dimMatch) return parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
    const numMatch = clean.match(/(\d+(?:\.\d+)?)/);
    return numMatch ? parseFloat(numMatch[1]) : 0;
}

/**
 * Replace multi-word variable names with single identifiers so that
 * evaluateMath() can match them with word-boundary regexes.
 */
export function normalizeFormula(formula: string): string {
    let result = formula;
    MULTI_WORD_NORMALIZATIONS.forEach(([regex, replacement]) => {
        result = result.replace(regex, replacement);
    });
    return result;
}

/**
 * Build the variable map that is passed to evaluateMath().
 * Keys must match the identifiers used after normalizeFormula().
 */
export function buildFormulaVarMap(params: {
    length: number;
    height: number;
    ceilingArea: number;
    perimeter: number;
    wastage: number;
    layers: number;
    oc: number;
    packageSize: number;
    areaCover: number;
}): Record<string, number> {
    const { length, height, ceilingArea, perimeter, wastage, layers, oc, packageSize, areaCover } = params;
    return {
        // Primary names used in DB formulas
        Length:      length,
        Height:      height,
        Wastage:     wastage,
        layer:       layers,
        Layers:      layers,
        CeilingArea: ceilingArea,   // normalized from "Ceiling Area"
        SheetArea:   packageSize,   // normalized from "sheet area"
        BagSize:     packageSize,   // normalized from "bag size"
        AreaCover:   areaCover,     // normalized from "AREA COVER" / "Length Cover"
        Perimeter:   perimeter,
        OC:          oc,
        // Common single-letter aliases
        L:    length,
        H:    height,
        Area: ceilingArea > 0 ? ceilingArea : length * height,
        A:    ceilingArea > 0 ? ceilingArea : length * height,
        CA:   ceilingArea,
        P:    perimeter,
    };
}

/**
 * Round a number to 2 decimal places for display and cost calculations.
 */
export const roundToTwoDecimals = (value: number): number =>
    Math.round(value * 100) / 100;

/**
 * Evaluate a material formula string.
 * Returns null when the formula is empty or evaluation fails.
 * Result is rounded to 2 decimal places for consistent display and costing.
 */
export function evaluateMaterialFormula(
    formula: string,
    vars: Record<string, number>,
): number | null {
    if (!formula || !formula.trim()) return null;
    try {
        const normalized = normalizeFormula(formula);
        const result = evaluateMath(normalized, vars);
        if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) return null;
        return roundToTwoDecimals(result);
    } catch {
        return null;
    }
}

/**
 * Detect which FORMULA_VAR_DEFINITIONS variables are actually referenced
 * inside the given formula string. Used by the modal to show only relevant
 * variable inputs.
 */
export function getActiveFormulaVars(formula: string): FormulaVarDef[] {
    if (!formula) return [];
    const normalized = normalizeFormula(formula);
    return FORMULA_VAR_DEFINITIONS.filter(def =>
        new RegExp(`\\b${def.key}\\b`, 'i').test(normalized),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate context from takeoff instances (shared with getRowDetails)
// ─────────────────────────────────────────────────────────────────────────────

interface AggregatedContext {
    totalLinearFeet: number;
    totalWallArea: number;
    totalCeilingArea: number;
    totalPerimeter: number;
    avgHeight: number;
}

function aggregateInstances(
    comp: AssemblyComponent,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
): AggregatedContext {
    const hMin = comp.heightCondition?.min ?? 0;
    const hMax = comp.heightCondition?.max ?? Infinity;

    let totalLinearFeet = 0;
    let totalWallArea = 0;
    let totalCeilingArea = 0;
    let totalPerimeter = 0;
    let avgHeight = 0;

    instances.forEach(inst => {
        const qty = inst.quantity || 1;
        const isCeilingInst = (inst.ceilingArea || 0) > 0;
        // For wall instances with missing height (0), fall back to the assembly's default height
        // so that LF-based formulas (e.g. fire safing) still compute correctly.
        const rawH = inst.height || 0;
        const h = (!isCeilingInst && rawH === 0 && assembly.defaultHeight)
            ? assembly.defaultHeight
            : rawH;
        const effectiveH = Math.max(0, Math.min(hMax, h) - hMin);
        totalCeilingArea += (inst.ceilingArea || 0) * qty;
        if (isCeilingInst) {
            totalPerimeter += (inst.perimeter || inst.length || 0) * qty;
        }
        if (effectiveH > 0) {
            totalLinearFeet += (inst.length || 0) * qty;
            totalWallArea += (inst.length || 0) * effectiveH * qty;
        }
    });

    if (instances.length === 0) {
        if (assembly.assemblyType === 'Ceiling') {
            totalCeilingArea = assembly.defaultArea || 0;
            totalPerimeter = assembly.defaultPerimeter || 0;
        } else {
            const defH = assembly.defaultHeight || 0;
            const effectiveH = Math.max(0, Math.min(hMax, defH) - hMin);
            if (effectiveH > 0) {
                totalLinearFeet = assembly.defaultLength || 0;
                avgHeight = effectiveH;
                totalWallArea = totalLinearFeet * avgHeight;
            }
        }
    } else if (totalLinearFeet > 0) {
        avgHeight = totalWallArea / totalLinearFeet;
    }

    return { totalLinearFeet, totalWallArea, totalCeilingArea, totalPerimeter, avgHeight };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main formula computation
// ─────────────────────────────────────────────────────────────────────────────

export interface FormulaQuantities {
    qty:      number | null;   // Wall Qty
    seQty:    number | null;   // Wall Se.Qty
    ceilQty:  number | null;   // Ceiling Qty
    ceilSeQty: number | null;  // Ceiling Se.Qty
    /** Variable map used for evaluation (for display in the modal) */
    varMap:   Record<string, number>;
}

/**
 * Dimensions sourced from final_output extracted_material.
 * Only totalLength (total_length) overrides the Length variable.
 * All other values (height, ceilingArea, etc.) still come from takeoff-instance aggregation.
 */
export interface ExtractedDimensions {
    totalLength: number;
}

/**
 * Compute formula-based quantities for a single component row.
 * Formula precedence: component override > material database formula.
 * Returns null for each when no formula is defined.
 */
export function computeFormulaQuantities(
    comp: AssemblyComponent,
    material: MaterialDefinition | undefined,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
    extractedDimensions?: ExtractedDimensions,
): FormulaQuantities {
    // Aggregate height, ceilingArea, perimeter from takeoff instances
    const ctx = aggregateInstances(comp, assembly, instances);
    // Length: use total_length from final_output when available, otherwise fall back to aggregated value
    const length      = extractedDimensions?.totalLength ?? ctx.totalLinearFeet;
    const baseHeight  = ctx.avgHeight;
    const ceilingArea = ctx.totalCeilingArea;
    const perimeter   = ctx.totalPerimeter;
    const baseLayers  = 1;

    const calcHeight = comp.overrideHeight ?? baseHeight;
    const layers = comp.overrideLayers ?? baseLayers;

    // Waste factor: component override → category default
    const wastage = comp.wasteFactor != null
        ? comp.wasteFactor
        : getWasteFactor(material?.category || 'Other');

    // OC spacing from comp.usage or comp.ocSpacing
    const ocMatch = (comp.ocSpacing || comp.usage).match(/(\d+)/);
    const oc = ocMatch ? parseInt(ocMatch[1]) : 16;

    const packageSize = parsePackageSize(material?.sheetBagBox);
    const areaCover = material?.lengthCover ? parseFloat(material.lengthCover) || 0 : 0;

    const varMap = buildFormulaVarMap({
        length,
        height:      calcHeight,
        ceilingArea,
        perimeter,
        wastage,
        layers,
        oc,
        packageSize,
        areaCover,
    });

    // Resolve formulas: component override wins over material DB formula
    const wallQtyFormula     = comp.formulaQtyOverride       ?? material?.formulaQty       ?? '';
    const wallSeQtyFormula   = comp.formulaSecQtyOverride    ?? material?.formulaSecQty    ?? '';
    const ceilQtyFormula     = comp.formulaCeilQtyOverride   ?? material?.formulaCeilQty   ?? '';
    const ceilSeQtyFormula   = comp.formulaCeilSecQtyOverride ?? material?.formulaCeilSecQty ?? '';

    return {
        qty:       evaluateMaterialFormula(wallQtyFormula, varMap),
        seQty:     evaluateMaterialFormula(wallSeQtyFormula, varMap),
        ceilQty:   evaluateMaterialFormula(ceilQtyFormula, varMap),
        ceilSeQty: evaluateMaterialFormula(ceilSeQtyFormula, varMap),
        varMap,
    };
}

/**
 * Decide which Qty value to display in the table based on assembly type.
 * Returns null if no formula is defined for the current context.
 */
export function getDisplayFormulaQty(
    comp: AssemblyComponent,
    material: MaterialDefinition | undefined,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
): number | null {
    const fq = computeFormulaQuantities(comp, material, assembly, instances);
    const isCeiling = assembly.assemblyType === 'Ceiling';
    return isCeiling ? fq.ceilQty : fq.qty;
}

/**
 * Decide which Se.Qty value to display in the table based on assembly type.
 * Returns null if no formula is defined for the current context.
 */
export function getDisplayFormulaSeQty(
    comp: AssemblyComponent,
    material: MaterialDefinition | undefined,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
): number | null {
    const fq = computeFormulaQuantities(comp, material, assembly, instances);
    const isCeiling = assembly.assemblyType === 'Ceiling';
    return isCeiling ? fq.ceilSeQty : fq.seQty;
}

/**
 * Check whether a material has any formula defined for the given context.
 */
export function hasFormulaForContext(
    comp: AssemblyComponent,
    material: MaterialDefinition | undefined,
    isCeiling: boolean,
): boolean {
    if (isCeiling) {
        return !!(
            comp.formulaCeilQtyOverride ||
            comp.formulaCeilSecQtyOverride ||
            material?.formulaCeilQty ||
            material?.formulaCeilSecQty
        );
    }
    return !!(
        comp.formulaQtyOverride ||
        comp.formulaSecQtyOverride ||
        material?.formulaQty ||
        material?.formulaSecQty
    );
}

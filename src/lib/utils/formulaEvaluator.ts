/**
 * Formula Evaluator Utilities
 *
 * Handles evaluation of material quantity formulas from the database.
 * Supports multi-word variable names like "sheet area", "bag size", "Ceiling Area".
 * Also supports bracket-notation variables like [LEN], [LAYER], [WST_FR], [SIZE_NUM]
 * used in MaterialDatabaseRow formulas — brackets are stripped by evaluateMath's sanitizer.
 */

import { WallAssembly, AssemblyComponent, MaterialDefinition, TakeoffInstance } from '@/types';
import type { MaterialDatabaseRow } from '@/types/databases';
import { evaluateMath } from '@/services/gemini/client';
import { getWasteFactor } from '@/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Multi-word variable normalizations (formula text → single identifier)
// ─────────────────────────────────────────────────────────────────────────────

const MULTI_WORD_NORMALIZATIONS: [RegExp, string][] = [
    // Unicode math symbols → ASCII operators (must run before multi-word replacements)
    [/×/g, '*'],
    [/÷/g, '/'],
    // Function-style constants — e.g. Screw_Spacing(12) means "12-inch screw spacing" (literal constant)
    // Must run before underscore-containing identifiers are processed
    [/Screw_Spacing\(\s*(\d+(?:\.\d+)?)\s*\)/gi, '$1'],
    // Underscore-aliased variables → canonical single-word identifiers
    [/Stud_OC\b/gi, 'OC'],
    // Multi-word variables
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
    /** sizeNum from MaterialDatabaseRow.sizes[0].sizeNum — resolves [SIZE_NUM] bracket notation */
    sizeNum?: number;
    /** Result of QTY1 evaluation — resolves QTY1 reference in QTY2 formulas */
    qty1Result?: number;
}): Record<string, number> {
    const { length, height, ceilingArea, perimeter, wastage, layers, oc, packageSize, areaCover, sizeNum, qty1Result } = params;
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
        // Bracket-notation aliases: evaluateMath strips [ ] so [LEN] becomes LEN etc.
        LEN:      length,
        LAYER:    layers,
        WST_FR:   wastage,
        SIZE_NUM: sizeNum ?? packageSize,
        // QTY1 reference used in QTY2 formulas (e.g. "QTY1 / SIZE_NUM")
        QTY1:     qty1Result ?? 0,
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
        const h = (!isCeilingInst && assembly.defaultHeight)
            ? assembly.defaultHeight
            : 0;
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
    // Length: comp override > total_length from final_output > aggregated from takeoff
    const length      = comp.lengthOverride ?? extractedDimensions?.totalLength ?? ctx.totalLinearFeet;
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

// ─────────────────────────────────────────────────────────────────────────────
// MaterialDatabaseRow-aware counterparts
// These are used by assemblyRowResolver — they work with the NEW material_database
// schema (MaterialDatabaseRow) instead of the legacy MaterialDefinition.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a MaterialDatabaseRow has any formula for the given context.
 * Mirrors hasFormulaForContext but reads from MaterialDatabaseRow fields.
 */
export function hasFormulaForContextFromDb(
    comp: AssemblyComponent,
    matRow: MaterialDatabaseRow | undefined,
    isCeiling: boolean,
): boolean {
    if (isCeiling) {
        return !!(
            comp.formulaCeilQtyOverride ||
            comp.formulaCeilSecQtyOverride ||
            matRow?.qty1FormulaCeiling ||
            matRow?.qty2FormulaCeiling
        );
    }
    return !!(
        comp.formulaQtyOverride ||
        comp.formulaSecQtyOverride ||
        matRow?.qty1Formula ||
        matRow?.qty2Formula
    );
}

/**
 * Compute formula-based quantities for a component using MaterialDatabaseRow.
 *
 * Key difference from computeFormulaQuantities:
 *  - Reads formula strings from MaterialDatabaseRow (qty1Formula, qty2Formula, etc.)
 *  - Uses sizes[0].sizeNum as the SIZE_NUM variable
 *  - Evaluates QTY1 first, then adds it to varMap before evaluating QTY2
 *    so formulas like "QTY1 / SIZE_NUM" work correctly
 */
export function computeFormulaQuantitiesFromDb(
    comp: AssemblyComponent,
    matRow: MaterialDatabaseRow | undefined,
    assembly: WallAssembly,
    instances: TakeoffInstance[],
    extractedDimensions?: ExtractedDimensions,
): FormulaQuantities {
    const ctx = aggregateInstances(comp, assembly, instances);
    const length      = comp.lengthOverride ?? extractedDimensions?.totalLength ?? ctx.totalLinearFeet;
    const baseHeight  = ctx.avgHeight;
    const ceilingArea = ctx.totalCeilingArea;
    const perimeter   = ctx.totalPerimeter;
    const calcHeight  = comp.overrideHeight ?? baseHeight;
    const layers      = comp.overrideLayers ?? 1;

    const wastePct = comp.wasteFactor ?? 5;
    const wastage  = wastePct / 100;

    const ocMatch = (comp.ocSpacing || comp.usage).match(/(\d+)/);
    const oc = ocMatch ? parseInt(ocMatch[1]) : 16;

    // SIZE_NUM comes from the first size entry's sizeNum
    const sizeNum    = matRow?.sizes?.[0]?.sizeNum ?? 0;
    const packageSize = sizeNum;
    const areaCover   = 0; // not in MaterialDatabaseRow

    // Build base varMap without QTY1 (added per-context after evaluating qty1)
    const baseVarMap = buildFormulaVarMap({
        length, height: calcHeight, ceilingArea, perimeter,
        wastage, layers, oc, packageSize, areaCover, sizeNum,
    });

    // Resolve formula strings: component override wins over DB formula
    const wallQty1Formula  = comp.formulaQtyOverride       ?? matRow?.qty1Formula       ?? '';
    const wallQty2Formula  = comp.formulaSecQtyOverride    ?? matRow?.qty2Formula       ?? '';
    const ceilQty1Formula  = comp.formulaCeilQtyOverride   ?? matRow?.qty1FormulaCeiling ?? '';
    const ceilQty2Formula  = comp.formulaCeilSecQtyOverride ?? matRow?.qty2FormulaCeiling ?? '';

    // Wall: evaluate QTY1 first, inject into varMap, then evaluate QTY2
    const wallQty1   = evaluateMaterialFormula(wallQty1Formula, baseVarMap);
    const wallVarMap = buildFormulaVarMap({ length, height: calcHeight, ceilingArea, perimeter, wastage, layers, oc, packageSize, areaCover, sizeNum, qty1Result: wallQty1 ?? 0 });
    const wallQty2   = evaluateMaterialFormula(wallQty2Formula, wallVarMap);

    // Ceiling: same two-step evaluation
    const ceilQty1   = evaluateMaterialFormula(ceilQty1Formula, baseVarMap);
    const ceilVarMap = buildFormulaVarMap({ length, height: calcHeight, ceilingArea, perimeter, wastage, layers, oc, packageSize, areaCover, sizeNum, qty1Result: ceilQty1 ?? 0 });
    const ceilQty2   = evaluateMaterialFormula(ceilQty2Formula, ceilVarMap);

    return {
        qty:       wallQty1,
        seQty:     wallQty2,
        ceilQty:   ceilQty1,
        ceilSeQty: ceilQty2,
        varMap:    baseVarMap,
    };
}

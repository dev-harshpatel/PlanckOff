/**
 * Assembly Row Resolver — single source of truth for every column value
 * in the ComponentsList assembly table.
 *
 * Column data comes from three sources:
 *   1. MaterialDatabaseRow  — section, code, formulas, unitPrice, UOMs
 *   2. LabourDatabaseRow    — labour code, band selection, labQty formula, rate
 *   3. AssemblyComponent    — description (AI-extracted), overrides, waste%
 *
 * Context (wall / ceiling / bulkhead) is determined by MatRow.parentSection —
 * set at AI-match time, never re-derived from assembly.assemblyType.
 *
 * Rule: NO component ever computes a column value; it always calls resolveAssemblyRow().
 */

import type { AssemblyComponent, WallAssembly, TakeoffInstance } from '@/types';
import type { MaterialDatabaseRow, LabourDatabaseRow, LabourBandEntry } from '@/types/databases';
import type { AssemblyRowContext, ResolvedLabour, ResolvedAssemblyRow } from '@/types/assemblyResolver';
import {
    computeFormulaQuantitiesFromDb,
    evaluateMaterialFormula,
    type ExtractedDimensions,
} from './formulaEvaluator';

// ─────────────────────────────────────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Derive context from the matched material row's parentSection. */
export function resolveAssemblyContext(matRow: MaterialDatabaseRow): AssemblyRowContext {
    const s = matRow.parentSection;
    const isCeiling = s === 'Ceiling';
    const isBulkhead = s === 'Bulkhead';
    return { isCeiling, isBulkhead, isWall: !isCeiling && !isBulkhead };
}

/** Pick the correct labour code from the material row based on context. */
export function selectLabourCode(matRow: MaterialDatabaseRow, ctx: AssemblyRowContext): string {
    if (ctx.isCeiling) return matRow.ceilingLabourCode;
    if (ctx.isBulkhead) return matRow.bulkheadLabourCode;
    return matRow.wallLabourCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labour lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Find the LabourDatabaseRow for a given parent code (case-insensitive). */
export function findLabourRow(
    labourDb: LabourDatabaseRow[],
    parentCode: string,
): LabourDatabaseRow | null {
    if (!parentCode) return null;
    const lower = parentCode.toLowerCase();
    return labourDb.find(r => r.parentCode.toLowerCase() === lower) ?? null;
}

/**
 * Select the right labour band for a given wall height.
 * Priority: exact height range → "All" band → lowest htMinFt band.
 */
export function selectLabourBand(
    labourRow: LabourDatabaseRow,
    wallHeight: number,
): LabourBandEntry | null {
    const bands = labourRow.labourBands;
    if (!bands.length) return null;

    const heightMatch = bands.find(
        b => b.htBand !== 'All' && wallHeight >= b.htMinFt && wallHeight < b.htMaxFt,
    );
    if (heightMatch) return heightMatch;

    const allBand = bands.find(b => b.htBand === 'All');
    if (allBand) return allBand;

    return [...bands].sort((a, b) => a.htMinFt - b.htMinFt)[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve every column value for one row in the assembly table.
 *
 * @param comp           - The AssemblyComponent (carries overrides, materialCode, materialName)
 * @param matRow         - The matched MaterialDatabaseRow (null if no DB match yet)
 * @param labourDb       - Full labour database for band lookup
 * @param assembly       - Parent WallAssembly (for default height, assemblyType)
 * @param takeoffInstances - Takeoff instances for formula variable aggregation
 * @param extractedDims  - Optional override for the Length variable from final_output
 */
export function resolveAssemblyRow(
    comp: AssemblyComponent,
    matRow: MaterialDatabaseRow | null,
    labourDb: LabourDatabaseRow[],
    assembly: WallAssembly,
    takeoffInstances: TakeoffInstance[],
    extractedDims?: ExtractedDimensions,
): ResolvedAssemblyRow {

    // ── Context from matched material row ──────────────────────────────────
    const ctx = matRow
        ? resolveAssemblyContext(matRow)
        : { isCeiling: false, isBulkhead: false, isWall: true };

    // ── Identification ──────────────────────────────────────────────────────
    const section      = matRow?.section     ?? comp.sectionCode ?? '';
    const materialCode = matRow?.code        ?? comp.materialCode ?? '';
    const description  = comp.materialName   ?? matRow?.description ?? '';

    // ── OC (display) ────────────────────────────────────────────────────────
    const ocMatch = (comp.ocSpacing || comp.usage).match(/(\d+)/);
    const oc = ocMatch ? `${ocMatch[1]}"` : '';

    // ── Waste ───────────────────────────────────────────────────────────────
    const wastePct = comp.wasteFactor ?? 5;

    // ── Quantities via formula evaluation ───────────────────────────────────
    const fq = computeFormulaQuantitiesFromDb(
        comp, matRow ?? undefined, assembly, takeoffInstances, extractedDims,
    );

    const qty1 = ctx.isCeiling ? fq.ceilQty  : fq.qty;
    const qty2 = ctx.isCeiling ? fq.ceilSeQty : fq.seQty;
    const uom1 = ctx.isCeiling ? (matRow?.uom1Ceiling ?? '') : (matRow?.uom1 ?? '');
    const uom2 = ctx.isCeiling ? (matRow?.uom2Ceiling ?? '') : (matRow?.uom2 ?? '');

    // Size = QTY1 / SIZE_NUM (first size entry's sizeNum)
    const sizeNum = matRow?.sizes?.[0]?.sizeNum ?? 0;
    const size    = qty1 != null && sizeNum > 0
        ? Math.round((qty1 / sizeNum) * 100) / 100
        : null;

    // ── Labour ──────────────────────────────────────────────────────────────
    const labourCode = matRow ? selectLabourCode(matRow, ctx) : '';
    const wallHeight = comp.overrideHeight ?? assembly.defaultHeight ?? 0;
    const labourRow  = labourCode ? findLabourRow(labourDb, labourCode) : null;
    const labourBand = labourRow ? selectLabourBand(labourRow, wallHeight) : null;

    let labour: ResolvedLabour | null = null;
    if (labourBand) {
        // Evaluate the band's QTY1 formula using the same variable map (with QTY1 = material qty1)
        const labVarMap = { ...fq.varMap, QTY1: qty1 ?? 0 };
        const labQty = labourBand.qty1Formula
            ? evaluateMaterialFormula(labourBand.qty1Formula, labVarMap)
            : null;
        const labUnitRate  = labourBand.ratePerUom;
        const totalLabCost = (labQty ?? 0) * labUnitRate;
        labour = {
            parentCode:   labourCode,
            bandCode:     labourBand.labourCode,
            labQty,
            labUom:       labourBand.qty1Uom || labourBand.uom,
            labUnitRate,
            totalLabCost,
        };
    }

    // ── Costs ────────────────────────────────────────────────────────────────
    // Mat. Unit $ overridden by comp.overrideMatCost if set, otherwise from DB
    const matUnitPrice  = comp.overrideMatCost ?? matRow?.unitPrice ?? 0;
    const totalMatCost  = matUnitPrice * (qty2 ?? 0);
    const totalLabCost  = labour?.totalLabCost ?? 0;
    const totalCost     = totalMatCost + totalLabCost;

    return {
        section,
        materialCode,
        description,
        oc,
        labourCode,
        labour,
        wastePct,
        qty1,
        uom1,
        qty2,
        uom2,
        size,
        matUnitPrice,
        totalMatCost,
        totalLabCost,
        totalCost,
    };
}

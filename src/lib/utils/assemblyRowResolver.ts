/**
 * Assembly Row Resolver — single source of truth for every column value
 * in the ComponentsList assembly table.
 *
 * Data priority order (JSON-first architecture):
 *   1. comp.embeddedMatRow / comp.embeddedLabRow — embedded in final JSON at match time
 *   2. matRow / labourDb — live DB lookup (fallback for old data without embedded rows)
 *   3. AssemblyComponent overrides — user-set values (override_*, layers_override, etc.)
 *
 * Context (wall / ceiling / bulkhead) comes from assembly.assemblyType,
 * which is set from the Excel takeoff category at parse time.
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
/**
 * Derives assembly context from the WallAssembly assemblyType — same logic as
 * getAssemblyContext() in resolveMatchedMaterial. Uses assembly category
 * (Interior/Exterior Wall → wall, Ceiling → ceiling, Bulkhead → bulkhead)
 * NOT matRow.parentSection (which stores material categories like "FRAMING").
 */
export function resolveAssemblyContext(assembly: WallAssembly): AssemblyRowContext {
    const lower = (assembly.assemblyType ?? '').toLowerCase();
    const isCeiling  = lower.includes('ceiling');
    const isBulkhead = lower.includes('bulkhead');
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

/**
 * Find the LabourDatabaseRow for a given code (case-insensitive).
 *
 * Two-pass lookup because the material DB uses two naming conventions:
 *   • Multi-band bunches: references the PARENT code (e.g. "LAB-HNG")
 *   • Single-band bunches: references the BAND code  (e.g. "LAB-FUR-WALL")
 *
 * Pass 1: match r.parentCode === code  (multi-band case, most common)
 * Pass 2: match any r.labourBands[*].labourCode === code (single-band case)
 */
export function findLabourRow(
    labourDb: LabourDatabaseRow[],
    code: string,
): LabourDatabaseRow | null {
    if (!code) return null;
    const lower = code.toLowerCase();
    return (
        labourDb.find(r => r.parentCode.toLowerCase() === lower) ??
        labourDb.find(r => r.labourBands.some(b => b.labourCode.toLowerCase() === lower)) ??
        null
    );
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

    // ── Context from assembly type (Interior Wall / Ceiling / Bulkhead) ───────
    const ctx = resolveAssemblyContext(assembly);

    // ── Effective mat row: JSON-embedded (primary) or live DB lookup (fallback) ─
    // Cast is safe: omitted fields (id, searchKeywords, deletedAt) are never read by the resolver.
    const effectiveMatRow: MaterialDatabaseRow | null =
        (comp.embeddedMatRow as MaterialDatabaseRow | undefined) ?? matRow;

    // ── Identification ──────────────────────────────────────────────────────
    const section      = effectiveMatRow?.section     ?? comp.sectionCode ?? '';
    const materialCode = effectiveMatRow?.code        ?? comp.materialCode ?? '';
    const description  = comp.materialName   ?? effectiveMatRow?.description ?? '';

    // ── OC (display) ────────────────────────────────────────────────────────
    const ocMatch = (comp.ocSpacing || comp.usage).match(/(\d+)/);
    const oc = ocMatch ? `${ocMatch[1]}"` : '';

    // ── Waste ───────────────────────────────────────────────────────────────
    const wastePct = comp.wasteFactor ?? 5;

    // ── Quantities via formula evaluation ───────────────────────────────────
    const fq = computeFormulaQuantitiesFromDb(
        comp, effectiveMatRow ?? undefined, assembly, takeoffInstances, extractedDims,
    );

    const qty1 = ctx.isCeiling ? fq.ceilQty  : fq.qty;
    const qty2 = ctx.isCeiling ? fq.ceilSeQty : fq.seQty;
    const uom1 = ctx.isCeiling ? (effectiveMatRow?.uom1Ceiling ?? '') : (effectiveMatRow?.uom1 ?? '');
    const uom2 = ctx.isCeiling ? (effectiveMatRow?.uom2Ceiling ?? '') : (effectiveMatRow?.uom2 ?? '');

    // Size = QTY1 / SIZE_NUM (first size entry's sizeNum)
    const sizeNum = effectiveMatRow?.sizes?.[0]?.sizeNum ?? 0;
    const size    = qty1 != null && sizeNum > 0
        ? Math.round((qty1 / sizeNum) * 100) / 100
        : null;

    // ── Labour ──────────────────────────────────────────────────────────────
    // JSON-embedded labour row is primary; live labourDb lookup is fallback for old data.
    const labourCode = effectiveMatRow ? selectLabourCode(effectiveMatRow, ctx) : '';
    const wallHeight = comp.overrideHeight ?? assembly.defaultHeight ?? 0;
    // Cast is safe: omitted fields (id, deletedAt) are never read by the resolver.
    const labourRow: LabourDatabaseRow | null =
        (comp.embeddedLabRow as LabourDatabaseRow | undefined) ??
        (labourCode ? findLabourRow(labourDb, labourCode) : null);
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
    // Mat. Unit $ overridden by comp.overrideMatCost if set, otherwise from JSON/DB
    const matUnitPrice  = comp.overrideMatCost ?? effectiveMatRow?.unitPrice ?? 0;
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

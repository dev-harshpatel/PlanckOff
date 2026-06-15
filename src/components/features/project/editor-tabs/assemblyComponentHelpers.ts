import { AssemblyComponent, MaterialDefinition, WallAssembly } from '@/types';
import { MaterialCosting } from '@/types/assembly';
import {
    computeFormulaQuantities,
    hasFormulaForContext,
    roundToTwoDecimals,
    type ExtractedDimensions,
} from '@/lib/utils/formulaEvaluator';
import { getEffectiveProjectUnitCost } from '@/lib/utils/projectPricing';

/**
 * Resolve the MaterialDefinition for a component row.
 * Prefers materialCode if set; falls back to matching by description.
 */
export const getMaterialByRowCode = (
    comp: AssemblyComponent,
    materials: MaterialDefinition[],
): MaterialDefinition | undefined => {
    const byDescription = materials.find((m) => m.description === comp.materialName);
    const rowCode = comp.materialCode ?? byDescription?.code;
    return rowCode ? materials.find((m) => m.code === rowCode) : undefined;
};

/**
 * Extract total_length from the final output for a component.
 * Used as the `Length` variable in formula evaluation.
 */
export const findExtractedDimsForComponent = (
    comp: AssemblyComponent,
    materialCostingData?: MaterialCosting,
): ExtractedDimensions | undefined => {
    if (!materialCostingData) return undefined;
    const code = comp.materialCode;
    if (!code) return undefined;
    const item = materialCostingData.materials_costing.find((mci) =>
        mci.matched_materials.some((m) => m.code === code) ||
        mci.matched_labor.some((l) => l.code === code),
    );
    const totalLength = item?.extracted_material?.total_length;
    if (totalLength == null) return undefined;
    return { totalLength };
};

/**
 * Unit Cost for a row: component override → effective project unit cost from DB.
 */
export const getUnitCostForRow = (
    comp: AssemblyComponent,
    materials: MaterialDefinition[],
): number | undefined => {
    const mat = getMaterialByRowCode(comp, materials);
    const val = comp.overrideMatCost ?? (mat ? getEffectiveProjectUnitCost(mat) : undefined);
    return val != null ? val : undefined;
};

/**
 * Quantity used for cost calculation:
 * - If a formula applies → use formula result (ceiling or wall depending on assembly type)
 * - Else → use stored pipeline quantity
 */
export const getQuantityForCost = (
    comp: AssemblyComponent,
    assembly: WallAssembly,
    materials: MaterialDefinition[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    takeoffInstances: any[],
    materialCostingData: MaterialCosting | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRowDetails: (comp: AssemblyComponent, assembly: WallAssembly, instances: any[]) => any,
): number => {
    const details = getRowDetails(comp, assembly, takeoffInstances);
    const mat = getMaterialByRowCode(comp, materials);
    const isCeiling = assembly.assemblyType === 'Ceiling';
    const hasFormula = hasFormulaForContext(comp, mat, isCeiling);

    if (hasFormula) {
        const extDims = findExtractedDimsForComponent(comp, materialCostingData);
        const fq = computeFormulaQuantities(comp, mat, assembly, takeoffInstances, extDims);
        const qty = isCeiling ? fq.ceilQty : fq.qty;
        return roundToTwoDecimals(qty ?? details.quantity ?? 0);
    }
    return roundToTwoDecimals(details.quantity ?? 0);
};

/**
 * Total Cost for a row = Unit Cost × Quantity (for cost), rounded to 2 decimals.
 */
export const getRowTotalCost = (
    comp: AssemblyComponent,
    assembly: WallAssembly,
    materials: MaterialDefinition[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    takeoffInstances: any[],
    materialCostingData: MaterialCosting | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getRowDetails: (comp: AssemblyComponent, assembly: WallAssembly, instances: any[]) => any,
): number => {
    const unitCost = getUnitCostForRow(comp, materials);
    const qty = getQuantityForCost(comp, assembly, materials, takeoffInstances, materialCostingData, getRowDetails);
    return roundToTwoDecimals((unitCost ?? 0) * qty);
};

/**
 * Returns true if the component row represents a Labor item.
 */
export const getIsLaborRow = (
    comp: AssemblyComponent,
    materials: MaterialDefinition[],
): boolean => {
    if (comp.materialCode) return comp.materialCode.startsWith('LAB-');
    const mat = materials.find((m) => m.description === comp.materialName);
    return mat?.category === 'Labor';
};

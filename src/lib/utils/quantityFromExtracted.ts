/**
 * Shared quantity computation from extracted_material.
 * Used by enrichFinalOutputWithQuantities and aggregateMaterialsFromCosting.
 */

import type { MaterialsCostingItem, MatchedMaterial } from "@/types/assembly";
import type { MaterialDefinition } from "@/types";
import { getWasteFactor, inferCategoryFromMaterial } from "@/constants";
import {
  buildFormulaVarMap,
  evaluateMaterialFormula,
  parsePackageSize,
} from "@/lib/utils/formulaEvaluator";

/**
 * Compute primary quantity for a matched material from extracted_material.
 * Uses material DB formulas when available.
 */
export const computeQuantityFromExtracted = (
  ext: MaterialsCostingItem["extracted_material"],
  unit: string,
  mat: MatchedMaterial,
  materials: MaterialDefinition[],
): number => {
  if (!ext) return 0;
  const totalLength = (ext as { total_length?: number }).total_length ?? 0;
  const heightFt = (ext as { height_ft?: number }).height_ft ?? 0;
  const ceilingArea = (ext as { ceiling_area?: number }).ceiling_area ?? 0;
  const areaParementer = (ext as { area_parementer?: number }).area_parementer ?? 0;
  const layers = (ext as { layers?: number }).layers ?? 1;

  const matDef = materials.find(
    (m) => m.code === mat.code || m.description === mat.description,
  );
  const category =
    matDef?.category ??
    inferCategoryFromMaterial(
      (ext as { raw_text?: string })?.raw_text,
      mat.code,
    );
  const wastage = getWasteFactor(category);

  const u = unit.toUpperCase();
  if (u === "SF" || u === "SQFT" || u === "SQF") {
    if (ceilingArea && ceilingArea > 0) return ceilingArea * (1 + wastage) * layers;
    const fallback = totalLength * heightFt * (1 + wastage) * layers;
    const formula = matDef?.formulaQty;
    if (formula) {
      const packageSize = parsePackageSize(matDef?.sheetBagBox);
      const areaCover = matDef?.lengthCover
        ? parseFloat(String(matDef.lengthCover)) || 0
        : 0;
      const varMap = buildFormulaVarMap({
        length: totalLength,
        height: heightFt,
        ceilingArea: ceilingArea ?? 0,
        perimeter: areaParementer ?? 0,
        wastage,
        layers,
        oc: 16,
        packageSize: packageSize || 32,
        areaCover,
      });
      const result = evaluateMaterialFormula(formula, varMap);
      // Sanity check: formula may be wrong (e.g. DB typo). If result > 5x fallback, use fallback.
      if (result != null && fallback > 0 && result <= fallback * 5) return result;
      if (result != null && fallback > 0) return fallback;
      if (result != null) return result;
    }
    return fallback;
  }
  if (u === "LF") return totalLength;
  if (u === "EA" || u === "HR") return 1;
  if (ceilingArea && ceilingArea > 0) return ceilingArea * (1 + wastage) * layers;
  return totalLength * heightFt * (1 + wastage) * layers;
};

/**
 * Compute secondary quantity for a matched material from extracted_material.
 */
export const computeSecQuantityFromExtracted = (
  ext: MaterialsCostingItem["extracted_material"],
  material: MaterialDefinition | undefined,
  mat: MatchedMaterial,
  qty: number,
): number | null => {
  if (!ext) return null;

  const totalLength = (ext as { total_length?: number }).total_length ?? 0;
  const heightFt = (ext as { height_ft?: number }).height_ft ?? 0;
  const ceilingArea = (ext as { ceiling_area?: number }).ceiling_area ?? 0;
  const areaParementer = (ext as { area_parementer?: number }).area_parementer ?? 0;
  const layers = (ext as { layers?: number }).layers ?? 1;

  if (material?.formulaSecQty) {
    const packageSize = parsePackageSize(material.sheetBagBox);
    const areaCover = material.lengthCover
      ? parseFloat(String(material.lengthCover)) || 0
      : 0;
    const wastage = getWasteFactor(material.category);

    const varMap = buildFormulaVarMap({
      length: totalLength,
      height: heightFt,
      ceilingArea: ceilingArea ?? 0,
      perimeter: areaParementer ?? 0,
      wastage,
      layers,
      oc: 16,
      packageSize: packageSize || 32,
      areaCover,
    });

    return evaluateMaterialFormula(material.formulaSecQty, varMap);
  }

  if (
    mat.unit === "SF" &&
    /4x8|4\s*x\s*8|4'x8'|board|sheet/i.test(mat.description)
  ) {
    return Math.round((qty / 32) * 100) / 100;
  }
  if (mat.unit === "SF" && /4x12|4\s*x\s*12/i.test(mat.description)) {
    return Math.round((qty / 48) * 100) / 100;
  }

  return null;
};

/**
 * Compute quantity for labor (no formula lookup — uses ext dimensions only).
 * Labor typically uses SF, LF, HR, EA.
 */
export const computeLaborQuantityFromExtracted = (
  ext: MaterialsCostingItem["extracted_material"],
  unit: string,
): number => {
  if (!ext) return 0;
  const totalLength = (ext as { total_length?: number }).total_length ?? 0;
  const heightFt = (ext as { height_ft?: number }).height_ft ?? 0;
  const ceilingArea = (ext as { ceiling_area?: number }).ceiling_area ?? 0;

  const u = unit.toUpperCase();
  if (u === "SF" || u === "SQFT" || u === "SQF") {
    if (ceilingArea && ceilingArea > 0) return ceilingArea;
    return totalLength * heightFt;
  }
  if (u === "LF") return totalLength;
  if (u === "EA" || u === "HR") return 1;
  if (ceilingArea && ceilingArea > 0) return ceilingArea;
  return totalLength * heightFt;
};

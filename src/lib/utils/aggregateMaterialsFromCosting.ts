/**
 * Aggregate materials from materialCostingData (final output format) across all assemblies.
 * Sums Qty, Sec. Qty per unique material. Unit Cost unchanged. Total Cost = sum.
 */

/** Set to true to log Qty verification (per-assembly breakdown + final totals) */
const LOG_QTY_VERIFICATION = process.env.NEXT_PUBLIC_LOG_MATERIALS_QTY === 'true';

import type {
  MaterialCosting,
  MaterialsCostingItem,
  MatchedMaterial,
} from "@/types/assembly";
import {
  computeQuantityFromExtracted,
  computeSecQuantityFromExtracted,
} from "@/lib/utils/quantityFromExtracted";
export interface AggregatedMaterialRow {
  code: string;
  item: string;
  section: string;
  matCostCode: string;
  quantity: number;
  unit: string;
  secQuantity: number | null;
  secUnit: string | null;
  wastePercent: number;
  unitCost: number;
  totalCost: number;
}

/** Use stored quantity when present, else compute (backward compat for old final_outputs). */
const getQuantity = (
  ext: MaterialsCostingItem["extracted_material"],
  mat: MatchedMaterial,
): number => {
  if (mat.quantity != null && typeof mat.quantity === "number") {
    return mat.quantity;
  }
  return computeQuantityFromExtracted(ext, mat.unit, mat, []);
};

/** Use stored sec_quantity when present, else compute. */
const getSecQuantity = (
  ext: MaterialsCostingItem["extracted_material"],
  mat: MatchedMaterial,
  qty: number,
): number | null => {
  if (mat.sec_quantity != null && typeof mat.sec_quantity === "number") {
    return mat.sec_quantity;
  }
  return computeSecQuantityFromExtracted(ext, undefined, mat, qty);
};

export const aggregateMaterialsFromCosting = (
  materialCostingData: MaterialCosting[],
): AggregatedMaterialRow[] => {
  const aggMap = new Map<
    string,
    {
      code: string;
      item: string;
      section: string;
      matCostCode: string;
      quantity: number;
      unit: string;
      secQuantity: number;
      secUnit: string | null;
      wastePercent: number;
      unitCost: number;
      totalCostSum: number;
    }
  >();

  const perAssemblyQty: Record<string, { assemblyId: string; heightFt?: number; byMaterial: Record<string, number>; total: number }> = {};

  materialCostingData.forEach((assembly) => {
    let asmTotal = 0;
    const byMaterial: Record<string, number> = {};

    (assembly.materials_costing ?? []).forEach((costingItem) => {
      const { extracted_material, matched_material } = costingItem;

      const matList: MatchedMaterial[] = matched_material != null ? [matched_material] : [];
      matList.forEach((mat: MatchedMaterial) => {
        const qty = getQuantity(extracted_material, mat);
        asmTotal += qty;
        byMaterial[mat.description] = (byMaterial[mat.description] ?? 0) + qty;
        const secQty = getSecQuantity(
          extracted_material,
          mat,
          qty,
        );
        const unitCost = mat.unit_cost ?? 0;
        const rowTotal = qty * unitCost;

        const key = `${mat.code}|${mat.description}|${mat.unit}`;
        const secUnit = mat.sec_unit ?? (mat.unit === "SF" ? "EA" : mat.unit);

        if (aggMap.has(key)) {
          const existing = aggMap.get(key)!;
          existing.quantity += qty;
          existing.totalCostSum += rowTotal;
          if (secQty != null) {
            existing.secQuantity += secQty;
            existing.secUnit = secUnit;
          }
        } else {
          aggMap.set(key, {
            code: mat.code,
            item: mat.description,
            section: mat.section ?? '—',
            matCostCode: '',
            quantity: qty,
            unit: mat.unit,
            secQuantity: secQty ?? 0,
            secUnit: secQty != null ? secUnit : null,
            wastePercent: mat.waste_percent ?? 5,
            unitCost,
            totalCostSum: rowTotal,
          });
        }
      });
    });

    const heightFt = (assembly as { height_ft?: number }).height_ft;
    const compositeKey =
      typeof heightFt === 'number'
        ? `${assembly.assembly_id}@${heightFt}`
        : assembly.assembly_id;
    perAssemblyQty[compositeKey] = {
      assemblyId: assembly.assembly_id,
      heightFt,
      byMaterial,
      total: asmTotal,
    };
  });

  const TARGET_DESCRIPTION = '5/8" Type X Fire Rated Board 4x8';
  const STUD_TARGET_DESCRIPTION = '2-1/2" Metal Stud 20ga (30mil) 1-1/4" Flange';
  const P1_DRYWALL_DESC = TARGET_DESCRIPTION;
  if (LOG_QTY_VERIFICATION) {
    const rows = Array.from(aggMap.values());
    const targetRow = rows.find((r) => r.item === TARGET_DESCRIPTION);
    const studTargetRow = rows.find((r) => r.item === STUD_TARGET_DESCRIPTION);
    const perAssembly = Object.entries(perAssemblyQty)
      .filter(([, v]) => v.byMaterial[TARGET_DESCRIPTION] != null)
      .map(([key, v]) => ({
        key,
        assemblyId: v.assemblyId,
        heightFt: v.heightFt,
        qty: v.byMaterial[TARGET_DESCRIPTION],
      }));
    const sumFromLog = perAssembly.reduce((s, p) => s + p.qty, 0);
    console.group(`[Materials] "${TARGET_DESCRIPTION}" Qty verification`);
    console.table(perAssembly);
    console.log('Sum from per-assembly:', sumFromLog);
    console.log('Materials tab total:', targetRow?.quantity ?? 0);
    console.log('Match:', Math.abs((targetRow?.quantity ?? 0) - sumFromLog) < 0.01 ? '✓' : '✗');

    const p1Entries = Object.entries(perAssemblyQty).filter(
      ([k]) => k.startsWith('P1@') || k === 'P1'
    );
    const p1DrywallTotal = p1Entries.reduce(
      (s, [, v]) => s + (v.byMaterial[P1_DRYWALL_DESC] ?? 0),
      0
    );
    console.log('P1 assemblies found:', p1Entries.length);
    console.log('P1 drywall total:', p1DrywallTotal);
    console.groupEnd();

    const studPerAssembly = Object.entries(perAssemblyQty)
      .filter(([, v]) => v.byMaterial[STUD_TARGET_DESCRIPTION] != null)
      .map(([key, v]) => ({
        key,
        assemblyId: v.assemblyId,
        heightFt: v.heightFt,
        qty: v.byMaterial[STUD_TARGET_DESCRIPTION],
      }));
    const studSumFromLog = studPerAssembly.reduce((s, p) => s + p.qty, 0);
    console.group(`[Materials] "${STUD_TARGET_DESCRIPTION}" Qty verification`);
    console.table(studPerAssembly);
    console.log('Sum from per-assembly:', studSumFromLog);
    console.log('Materials tab total:', studTargetRow?.quantity ?? 0);
    console.log('Match:', Math.abs((studTargetRow?.quantity ?? 0) - studSumFromLog) < 0.01 ? '✓' : '✗');
    console.groupEnd();
  }

  return Array.from(aggMap.values()).map((v) => ({
    code: v.code,
    item: v.item,
    section: v.section,
    matCostCode: v.matCostCode,
    quantity: v.quantity,
    unit: v.unit,
    secQuantity: v.secQuantity > 0 ? v.secQuantity : null,
    secUnit: v.secQuantity > 0 ? v.secUnit : null,
    wastePercent: v.wastePercent,
    unitCost: v.unitCost,
    totalCost: v.totalCostSum,
  }));
};

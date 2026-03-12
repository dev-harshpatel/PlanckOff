/**
 * Enrich final_output JSON with computed quantity and sec_quantity on each
 * matched_material and matched_labor. Single source of truth — stored at finalize.
 */

import type { MaterialDefinition } from "@/types";
import type {
  MaterialsCostingItem,
  MatchedLabor,
  MatchedMaterial,
} from "@/types/assembly";
import {
  computeQuantityFromExtracted,
  computeSecQuantityFromExtracted,
} from "@/lib/utils/quantityFromExtracted";
import { getWasteFactor, inferCategoryFromMaterial } from "@/constants";

interface ExtractedMaterialLike {
  raw_text?: string;
  total_length?: number;
  height_ft?: number;
  ceiling_area?: number | null;
  area_parementer?: number | null;
  layers?: number | null;
}

interface MaterialsCostingItemLike {
  extracted_material: ExtractedMaterialLike | null;
  matched_materials: MatchedMaterial[];
  matched_labor: MatchedLabor[];
}

interface AssemblyLike {
  assembly_id?: string;
  materials_costing?: MaterialsCostingItemLike[];
}

/**
 * Enrich final_output with quantity, sec_quantity, sec_unit, waste_percent.
 * Mutates the input in place.
 */
export const enrichFinalOutputWithQuantities = (
  finalOutput: { assemblies?: unknown[] },
  materials: MaterialDefinition[],
): void => {
  const assemblies = finalOutput.assemblies ?? [];
  for (const assembly of assemblies) {
    const a = assembly as AssemblyLike;
    const costingItems = a.materials_costing ?? [];
    for (const item of costingItems) {
      const itemMutable = item as MaterialsCostingItemLike;
      itemMutable.matched_materials = (itemMutable.matched_materials ?? []).map((m) => ({ ...m }));
      itemMutable.matched_labor = (itemMutable.matched_labor ?? []).map((l) => ({ ...l }));

      const { extracted_material, matched_materials, matched_labor } = itemMutable;
      const ext = extracted_material as ExtractedMaterialLike | null;

      for (const mat of matched_materials) {
        const qty = computeQuantityFromExtracted(
          ext as MaterialsCostingItem["extracted_material"],
          mat.unit,
          mat,
          materials,
        );
        const matDef = materials.find(
          (m) => m.code === mat.code || m.description === mat.description,
        );
        const secQty = computeSecQuantityFromExtracted(
          ext as MaterialsCostingItem["extracted_material"],
          matDef,
          mat,
          qty,
        );
        const category =
          matDef?.category ??
          inferCategoryFromMaterial(ext?.raw_text ?? "", mat.code);
        const wastePercent = getWasteFactor(category) * 100;
        const secUnit =
          matDef?.mouWallSec ?? (mat.unit === "SF" ? "EA" : mat.unit);

        (mat as unknown as Record<string, unknown>).quantity = qty;
        if (secQty != null) {
          (mat as unknown as Record<string, unknown>).sec_quantity = secQty;
          (mat as unknown as Record<string, unknown>).sec_unit = secUnit;
        }
        (mat as unknown as Record<string, unknown>).waste_percent = wastePercent;
      }

      // Inherit waste_percent from the first material in this item (labor belongs to the same extracted material).
      const inheritedWastePercent =
        matched_materials.length > 0
          ? ((matched_materials[0] as unknown as Record<string, unknown>).waste_percent as number ?? 0)
          : 0;

      for (const lab of matched_labor) {
        const labDef = materials.find(
          (m) => m.code === lab.code || m.description === lab.description,
        );

        // Inherit waste % from the associated material in this costing item.
        (lab as unknown as Record<string, unknown>).waste_percent = inheritedWastePercent;

        // Only compute quantity/sec_quantity when an explicit formula exists in the DB.
        // No formula → leave both fields unset so the UI shows empty cells.
        if (labDef?.formulaQty) {
          const qty = computeQuantityFromExtracted(
            ext as MaterialsCostingItem["extracted_material"],
            lab.unit,
            lab as unknown as MatchedMaterial,
            materials,
          );
          (lab as unknown as Record<string, unknown>).quantity = qty;
          const secQty = computeSecQuantityFromExtracted(
            ext as MaterialsCostingItem["extracted_material"],
            labDef,
            lab as unknown as MatchedMaterial,
            qty,
          );
          if (secQty != null) {
            (lab as unknown as Record<string, unknown>).sec_quantity = secQty;
            (lab as unknown as Record<string, unknown>).sec_unit = labDef.mouWallSec ?? lab.unit;
          }
        }
      }
    }
  }
}

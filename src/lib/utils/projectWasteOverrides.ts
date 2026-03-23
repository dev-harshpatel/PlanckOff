import type { MaterialCosting } from "@/types/assembly";
import type { ProjectOverrideMap } from "@/types/core/projectOverrides";

export function applyProjectWasteOverrides(
  costingData: MaterialCosting[],
  overrideMap: ProjectOverrideMap,
): MaterialCosting[] {
  if (costingData.length === 0 || Object.keys(overrideMap).length === 0) {
    return costingData;
  }

  let changed = false;

  const updated = costingData.map((assembly) => ({
    ...assembly,
    materials_costing: assembly.materials_costing.map((item) => ({
      ...item,
      matched_materials: item.matched_materials.map((material) => {
        const wastePercent = overrideMap[material.code]?.wastePercent;
        if (wastePercent == null || material.waste_percent === wastePercent) {
          return material;
        }
        changed = true;
        return {
          ...material,
          waste_percent: wastePercent,
        };
      }),
      matched_labor: (item.matched_labor ?? []).map((labor) => {
        const wastePercent = overrideMap[labor.code]?.wastePercent;
        if (wastePercent == null || labor.waste_percent === wastePercent) {
          return labor;
        }
        changed = true;
        return {
          ...labor,
          waste_percent: wastePercent,
        };
      }),
    })),
  }));

  return changed ? updated : costingData;
}

export function applyProjectUnitCostOverrides(
  costingData: MaterialCosting[],
  overrideMap: ProjectOverrideMap,
): MaterialCosting[] {
  if (costingData.length === 0 || Object.keys(overrideMap).length === 0) {
    return costingData;
  }

  let changed = false;

  const updated = costingData.map((assembly) => ({
    ...assembly,
    materials_costing: assembly.materials_costing.map((item) => ({
      ...item,
      matched_materials: item.matched_materials.map((material) => {
        const unitCost = overrideMap[material.code]?.productivity;
        if (unitCost == null || material.unit_cost === unitCost) {
          return material;
        }
        changed = true;
        return {
          ...material,
          unit_cost: unitCost,
        };
      }),
      matched_labor: (item.matched_labor ?? []).map((labor) => {
        const unitCost = overrideMap[labor.code]?.hourlyRate;
        if (unitCost == null || labor.unit_cost === unitCost) {
          return labor;
        }
        changed = true;
        return {
          ...labor,
          unit_cost: unitCost,
        };
      }),
    })),
  }));

  return changed ? updated : costingData;
}

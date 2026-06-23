import type { MaterialCosting } from "@/types/assembly";
import type { ProjectOverrideMap } from "@/types/core/projectOverrides";
import {
  applyProjectUnitCostOverrides,
  applyProjectWasteOverrides,
} from "@/lib/utils/projectWasteOverrides";

// spec_database removed — unit costs come from pipeline output (mat.unit_cost / lab.unit_cost)
// buildProjectPriceMap and getEffectiveProjectUnitCost deleted 2026-06-22

export function applyProjectCostingOverrides(
  costingData: MaterialCosting[],
  overrideMap: ProjectOverrideMap,
): MaterialCosting[] {
  return applyProjectWasteOverrides(
    applyProjectUnitCostOverrides(costingData, overrideMap),
    overrideMap,
  );
}

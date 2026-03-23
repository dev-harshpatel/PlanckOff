import type { MaterialDefinition } from "@/types";
import type { MaterialCosting } from "@/types/assembly";
import type { ProjectOverrideMap } from "@/types/core/projectOverrides";
import {
  applyProjectUnitCostOverrides,
  applyProjectWasteOverrides,
} from "@/lib/utils/projectWasteOverrides";

export interface ProjectPriceMapEntry {
  cost: number;
  per: number;
}

export function getEffectiveProjectUnitCost(material: MaterialDefinition): number {
  // Guard: treat NaN and non-finite values as absent (same as undefined/null for ?? purposes)
  const safe = (v: number | undefined | null): number | undefined =>
    v != null && Number.isFinite(v) ? v : undefined;

  if (String(material.category).toLowerCase() === "labor") {
    return safe(material.hourlyRate) ?? safe(material.matCost) ?? 65;
  }
  return safe(material.productivity) ?? safe(material.matCost) ?? 0;
}

export function buildProjectPriceMap(
  materials: MaterialDefinition[],
): Record<string, ProjectPriceMapEntry> {
  const map: Record<string, ProjectPriceMapEntry> = {};
  materials.forEach((material) => {
    if (!material.description) return;
    map[material.description] = {
      cost: getEffectiveProjectUnitCost(material),
      per: 1,
    };
  });
  return map;
}

export function applyProjectCostingOverrides(
  costingData: MaterialCosting[],
  overrideMap: ProjectOverrideMap,
): MaterialCosting[] {
  return applyProjectWasteOverrides(
    applyProjectUnitCostOverrides(costingData, overrideMap),
    overrideMap,
  );
}

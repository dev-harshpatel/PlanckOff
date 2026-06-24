import { WallAssembly } from "@/types";
import { MaterialCosting } from "@/types/assembly";
import {
  applyOverridesToCostingData,
  buildAssemblyOverrideMaps,
} from "@/lib/utils/assemblyOverrideUtils";

/**
 * Maps UI-side WallAssembly structures back to MaterialCosting[]
 * for persistence in final_output.
 *
 * This is a pure, immutable wrapper around the existing override pipeline:
 * - For each assembly in updatedAssemblies, we:
 *   - Build override maps from its components (height, layers, usage, oc, qty, waste%, unit cost)
 *   - Apply those overrides to the current MaterialCosting[] snapshot
 *
 * IMPORTANT:
 * - This function is currently NOT wired into any save paths; it mirrors the logic
 *   used by `useAssemblySave` so it can be adopted later without changing behavior.
 */
export const mapUiAssembliesToCosting = (
  existingCostingData: MaterialCosting[],
  updatedAssemblies: WallAssembly[],
): MaterialCosting[] => {
  if (existingCostingData.length === 0 || updatedAssemblies.length === 0) {
    return existingCostingData;
  }

  let nextCostingData = existingCostingData;

  updatedAssemblies.forEach((assembly) => {
    if (!assembly.id) {
      return;
    }

    const overrideMaps = buildAssemblyOverrideMaps(assembly);

    nextCostingData = applyOverridesToCostingData(
      nextCostingData,
      assembly.id,
      null,
      overrideMaps,
    );
  });

  return nextCostingData;
};



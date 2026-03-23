import { WallAssembly } from "@/types";
import { MaterialCosting } from "@/types/assembly";
import {
  getActiveCategories,
  getHeightSegments,
} from "@/lib/utils/laborHeightSplit";


/**
 * All override maps extracted from a single WallAssembly:
 * - Project-wide: unit cost and waste % (apply to ALL assembly instances of same code)
 * - Per-instance: qty, height, layering, usage, oc (apply only to the edited assembly)
 *
 * Height overrides use two separate maps:
 *   matHeightByGroup  — keyed by groupId (index of materials_costing row) for assemblies
 *                       loaded from final_output (each spec-line is independent)
 *   matHeight         — keyed by materialCode as fallback for manually-added components
 *                       that have no groupId
 */
export interface AssemblyOverrideMaps {
  materialUnitCostOverrides: Map<string, number>;
  laborUnitCostOverrides: Map<string, number>;
  matQty: Map<string, number>;
  matWaste: Map<string, number>;
  /** Per-group (groupId → height) for grouped components. */
  matHeightByGroup: Map<number, number>;
  /** Per-code fallback height for non-grouped (manually-added) components. */
  matHeight: Map<string, number>;
  matLength: Map<string, number>;
  matUsage: Map<string, string>;
  matLayers: Map<string, number>;
  matOc: Map<string, string>;
  labWaste: Map<string, number>;
}

/**
 * Build all override maps for a given assembly.
 *
 * For waste%, only the FIRST occurrence of each code is recorded (first-write-wins).
 * For height, grouped components (groupId set) are stored per-group so that
 * changing one spec-line's height does not bleed into other spec-lines that
 * share the same material code (e.g. two layers of DW-58-8-X on opposite sides).
 */
export const buildAssemblyOverrideMaps = (
  assemblyToSave: WallAssembly,
): AssemblyOverrideMaps => {
  const materialUnitCostOverrides = new Map<string, number>();
  const laborUnitCostOverrides = new Map<string, number>();
  const matQty = new Map<string, number>();
  const matWaste = new Map<string, number>();
  const matHeightByGroup = new Map<number, number>();
  const matHeight = new Map<string, number>(); // fallback for non-grouped
  const matLength = new Map<string, number>();
  const matUsage = new Map<string, string>();
  const matLayers = new Map<string, number>();
  const matOc = new Map<string, string>();
  const labWaste = new Map<string, number>();

  for (const comp of assemblyToSave.components) {
    if (!comp.materialCode) continue;
    const isLabor = comp.materialCode.startsWith("LAB-");

    if (comp.overrideMatCost != null) {
      if (isLabor) {
        laborUnitCostOverrides.set(comp.materialCode, comp.overrideMatCost);
      } else {
        materialUnitCostOverrides.set(comp.materialCode, comp.overrideMatCost);
      }
    }

    if (!isLabor) {
      if (comp.overrideQuantity != null) {
        matQty.set(comp.materialCode, comp.overrideQuantity);
      }
      if (comp.wasteFactor != null && !matWaste.has(comp.materialCode)) {
        matWaste.set(comp.materialCode, comp.wasteFactor * 100);
      }

      // Height: prefer per-group storage (first-write-wins within each group).
      // Fall back to per-code storage for manually-added components (no groupId).
      if (comp.overrideHeight != null) {
        if (comp.groupId != null) {
          if (!matHeightByGroup.has(comp.groupId)) {
            matHeightByGroup.set(comp.groupId, comp.overrideHeight);
          }
        } else {
          if (!matHeight.has(comp.materialCode)) {
            matHeight.set(comp.materialCode, comp.overrideHeight);
          }
        }
      }

      if (comp.lengthOverride != null) {
        matLength.set(comp.materialCode, comp.lengthOverride);
      }
      if (comp.usage) {
        matUsage.set(comp.materialCode, comp.usage);
      }
      if (comp.overrideLayers != null) {
        matLayers.set(comp.materialCode, comp.overrideLayers);
      }
      if (comp.ocSpacing != null) {
        matOc.set(comp.materialCode, comp.ocSpacing);
      }
    } else {
      // Labor height is derived from material height segments — not stored manually.
      if (comp.wasteFactor != null && !labWaste.has(comp.materialCode)) {
        labWaste.set(comp.materialCode, comp.wasteFactor * 100);
      }
    }
  }

  return {
    materialUnitCostOverrides,
    laborUnitCostOverrides,
    matQty,
    matWaste,
    matHeightByGroup,
    matHeight,
    matLength,
    matUsage,
    matLayers,
    matOc,
    labWaste,
  };
};

/**
 * Apply override maps onto the provided materialCostingData snapshot.
 *
 * - unit_cost and waste_percent are project-wide: applied across ALL assemblies for each code.
 * - qty, height, layering, usage, oc are per-instance: applied only to the edited assembly.
 *
 * Height overrides are applied per-group:
 *   • Groups whose height changed get height_ft_override = newGroupHeight on their materials
 *     and recalculated labor heights + muted flags.
 *   • Groups whose height did NOT change get their existing height_ft_override pinned so
 *     they are not accidentally affected when the assembly-level height_ft changes.
 */
export const applyOverridesToCostingData = (
  materialCostingData: MaterialCosting[],
  assemblyCode: string,
  heightFt: number | null,
  overrideMaps: AssemblyOverrideMaps,
): MaterialCosting[] => {
  const {
    materialUnitCostOverrides,
    laborUnitCostOverrides,
    matQty,
    matWaste,
    matHeightByGroup,
    matHeight,
    matLength,
    matUsage,
    matLayers,
    matOc,
    labWaste,
  } = overrideMaps;

  // Effective height from the edited group(s) — used for material/labor overrides only
  // (assembly-level height_ft is NOT mutated; composite id stays stable).
  const useGroupedMode = matHeightByGroup.size > 0;
  const newTotalHeight = useGroupedMode
    ? matHeightByGroup.values().next().value
    : matHeight.size > 0
      ? matHeight.values().next().value
      : null;

  const result = materialCostingData.map((costing) => {
    const costingHeightFt = (costing as unknown as { height_ft?: number }).height_ft;
    const isEditedAssembly =
      costing.assembly_id === assemblyCode &&
      (heightFt === null || costingHeightFt === heightFt);

    const nextCosting: MaterialCosting = {
      ...costing,
      materials_costing: costing.materials_costing.map((item, groupIdx) => {
        // Determine the new height for THIS group (null = not changed by this edit).
        const newGroupHeight = isEditedAssembly
          ? (useGroupedMode ? (matHeightByGroup.get(groupIdx) ?? null) : null)
          : null;

        return {
          ...item,
          matched_materials: item.matched_materials.map((mat) => {
            const base = {
              ...mat,
              unit_cost: materialUnitCostOverrides.get(mat.code) ?? mat.unit_cost,
              ...(matWaste.has(mat.code) && {
                waste_percent: matWaste.get(mat.code),
              }),
            };

            if (!isEditedAssembly) return base;

            // Per-instance overrides (qty, usage, layers, oc, length).
            if (matQty.has(mat.code)) base.quantity = matQty.get(mat.code);
            if (matLength.has(mat.code)) {
              (base as Record<string, unknown>).length_ft_override = matLength.get(mat.code);
            }
            if (matUsage.has(mat.code)) {
              (base as Record<string, unknown>).usage_override = matUsage.get(mat.code);
            }
            if (matLayers.has(mat.code)) {
              (base as Record<string, unknown>).layers_override = matLayers.get(mat.code);
            }
            if (matOc.has(mat.code)) {
              (base as Record<string, unknown>).oc_spacing_override = matOc.get(mat.code);
            }

            // Height override — group-aware.
            if (useGroupedMode) {
              if (newGroupHeight != null) {
                // This group's height was explicitly changed.
                (base as Record<string, unknown>).height_ft_override = newGroupHeight;
              } else if (newTotalHeight != null) {
                // Assembly-level height_ft is about to change; pin this group's
                // materials to their CURRENT effective height so they are not
                // silently pulled to the new assembly height on the next reload.
                const existing = (mat as Record<string, unknown>).height_ft_override as number | undefined;
                (base as Record<string, unknown>).height_ft_override = existing ?? heightFt;
              }
            } else {
              // Non-grouped fallback: apply by material code (old behavior).
              if (matHeight.has(mat.code)) {
                (base as Record<string, unknown>).height_ft_override = matHeight.get(mat.code);
              }
            }

            return base;
          }),

          matched_labor: (item.matched_labor ?? []).map((lab) => {
            const base = {
              ...lab,
              unit_cost: laborUnitCostOverrides.get(lab.code) ?? lab.unit_cost,
              ...(labWaste.has(lab.code) && {
                waste_percent: labWaste.get(lab.code),
              }),
            };

            if (!isEditedAssembly) return base;

            if (useGroupedMode) {
              if (newGroupHeight != null && lab.height_category) {
                // Only update labors that belong to the edited group.
                const groupSegments = getHeightSegments(newGroupHeight);
                const groupActiveCategories = getActiveCategories(newGroupHeight);
                const match = groupSegments.find((s) => s.category === lab.height_category);
                base.height_ft = match?.height_ft ?? 0;
                base.muted = !groupActiveCategories.has(lab.height_category);
              }
              // else: this group's labors are untouched.
            } else {
              // Non-grouped fallback: apply assembly-wide segments (old behavior).
              if (newTotalHeight != null && lab.height_category) {
                const segments = getHeightSegments(newTotalHeight);
                const cats = getActiveCategories(newTotalHeight);
                const match = segments.find((s) => s.category === lab.height_category);
                base.height_ft = match?.height_ft ?? 0;
                base.muted = !cats.has(lab.height_category);
              }
            }

            return base;
          }),
        };
      }),
    };

    // NOTE: we intentionally do NOT mutate height_ft on the assembly record.
    // height_ft is the pipeline-measured identity that makes (assembly_id, height_ft)
    // unique in final_output. Changing it would rename e.g. "P1@15" → "P1@10" and
    // collide with an already-existing P1@10 entry, causing duplicate rows and
    // cross-contamination of costing data. Height overrides are expressed solely
    // through material-level height_ft_override fields, which mapFinalOutputToWallAssemblies
    // already reads to compute the correct effectiveDefaultHeight.

    return nextCosting;
  });

  return result;
};

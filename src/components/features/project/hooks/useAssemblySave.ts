"use client";

import { useCallback } from "react";
import { MaterialDefinition, WallAssembly } from "@/types";
import { MaterialCosting } from "@/types/assembly";
import { ProjectOverrideMap } from "@/types/core/projectOverrides";
import {
  getWasteFactor,
  inferCategoryFromMaterial,
} from "@/constants/wasteFactor";
import { useToast } from "@/components/ui";
import {
  applyOverridesToCostingData,
  buildAssemblyOverrideMaps,
} from "@/lib/utils/assemblyOverrideUtils";
import { syncProjectOverrides } from "@/lib/utils/projectOverrideSync";

interface UseAssemblySaveProps {
  finalOutputId?: string | null;
  projectId?: string | null;
  /** Always-current ref so the save closure never reads stale materialCostingData. */
  materialCostingDataRef: React.MutableRefObject<MaterialCosting[]>;
  assembliesRef: React.MutableRefObject<WallAssembly[]>;
  resolvedMaterials: MaterialDefinition[];
  overrideMap: ProjectOverrideMap;
  onAssemblySaveComplete?: (updatedCostingData: MaterialCosting[]) => void;
  onOverrideMapChange?: React.Dispatch<React.SetStateAction<ProjectOverrideMap>>;
}

/**
 * Manages assembly save logic including:
 * - Building override maps from the edited assembly
 * - Applying overrides project-wide to materialCostingData
 * - PATCHing final_outputs in the database
 * - Syncing waste % and unit cost overrides to project_material_overrides
 */
export const useAssemblySave = ({
  finalOutputId,
  projectId,
  materialCostingDataRef,
  assembliesRef,
  resolvedMaterials,
  overrideMap,
  onAssemblySaveComplete,
  onOverrideMapChange,
}: UseAssemblySaveProps) => {
  const toast = useToast();

  const syncWasteOverrides = useCallback(
    async (assemblyToSave: WallAssembly) => {
      if (!projectId || !onOverrideMapChange) return;

      const materialByCode = new Map(
        resolvedMaterials.map((m) => [m.code, m]),
      );
      const upserts = new Map<string, number>();
      const deletes = new Set<string>();

      assemblyToSave.components.forEach((component) => {
        if (!component.materialCode || component.wasteFactor == null) return;

        const code = component.materialCode;
        const isLabor = code.startsWith("LAB-");
        const material = materialByCode.get(code);
        const globalWastePercent = isLabor
          ? 0
          : getWasteFactor(
              material?.category ??
                inferCategoryFromMaterial(component.materialName, code),
            ) * 100;
        const currentWastePercent =
          Math.round(component.wasteFactor * 10000) / 100;
        const existingWasteOverride = overrideMap[code]?.wastePercent;

        if (Math.abs(currentWastePercent - globalWastePercent) < 0.0001) {
          if (existingWasteOverride != null) {
            deletes.add(code);
          }
          return;
        }

        upserts.set(code, currentWastePercent);
        deletes.delete(code);
      });

      try {
        await syncProjectOverrides({
          projectId,
          items: [
            ...Array.from(upserts.entries()).map(([materialCode, wastePercent]) => ({
              materialCode,
              field: "wastePercent" as const,
              value: wastePercent,
              existingValue: overrideMap[materialCode]?.wastePercent,
            })),
            ...Array.from(deletes).map((materialCode) => ({
              materialCode,
              field: "wastePercent" as const,
              value: 0,
              baselineValue: 0,
              existingValue: overrideMap[materialCode]?.wastePercent,
            })),
          ],
          onOverrideMapChange,
        });
      } catch (error) {
        console.error("[WasteOverride] Failed to sync waste overrides:", error);
        toast.warning(
          "Waste Override Sync Failed",
          "Waste values were saved to the project output, but the override layer could not be fully synchronized.",
        );
      }
    },
    [onOverrideMapChange, overrideMap, projectId, resolvedMaterials, toast],
  );

  const syncUnitCostOverrides = useCallback(
    async (assemblyToSave: WallAssembly) => {
      if (!projectId || !onOverrideMapChange) return;

      const materialByCode = new Map(
        resolvedMaterials.map((m) => [m.code, m]),
      );
      const upserts = new Map<
        string,
        { field: "productivity" | "hourlyRate"; value: number }
      >();
      const deletes = new Map<string, "productivity" | "hourlyRate">();

      assemblyToSave.components.forEach((component) => {
        if (!component.materialCode || component.overrideMatCost == null) return;

        const code = component.materialCode;
        const isLabor = code.startsWith("LAB-");
        const material = materialByCode.get(code);
        const field = isLabor ? "hourlyRate" : "productivity";
        const baselineValue = isLabor
          ? material?.hourlyRate
          : material?.productivity;
        const nextValue = component.overrideMatCost;

        if (
          baselineValue != null &&
          Math.abs(nextValue - baselineValue) < 0.0001
        ) {
          if (overrideMap[code]?.[field] != null) {
            deletes.set(code, field);
          }
          upserts.delete(code);
          return;
        }

        upserts.set(code, { field, value: nextValue });
        deletes.delete(code);
      });

      if (upserts.size === 0 && deletes.size === 0) return;

      try {
        await syncProjectOverrides({
          projectId,
          items: [
            ...Array.from(upserts.entries()).map(([materialCode, update]) => ({
              materialCode,
              field: update.field,
              value: update.value,
              existingValue: overrideMap[materialCode]?.[update.field] as
                | number
                | undefined,
            })),
            ...Array.from(deletes.entries()).map(([materialCode, field]) => ({
              materialCode,
              field,
              value: 0,
              baselineValue: 0,
              existingValue: overrideMap[materialCode]?.[field] as
                | number
                | undefined,
            })),
          ],
          onOverrideMapChange,
        });
      } catch (error) {
        console.error("[UnitCostOverride] Failed to sync unit cost overrides:", error);
        toast.warning(
          "Unit Cost Override Sync Failed",
          "Unit cost values were saved to the project output, but the override layer could not be fully synchronized.",
        );
      }
    },
    [onOverrideMapChange, projectId, resolvedMaterials, toast],
  );

  /**
   * Persist assembly component overrides (unit_cost, quantity, waste_percent, Hgt/OC/Layering)
   * to the final output in DB. Called only by the Save button in AssemblyEditorModal.
   */
  const handleSaveAssembly = useCallback(
    async (savedAssembly: WallAssembly) => {
      if (!finalOutputId) {
        return;
      }

      // Prefer the latest assembly from the always-current ref to avoid stale closure
      // (e.g. when a NumberInput blur and Save click happen in the same event cycle).
      const latestAssembly = assembliesRef.current.find(
        (a) => a.id === savedAssembly.id,
      );
      const assemblyToSave = latestAssembly ?? savedAssembly;

      // Parse assembly_id and height_ft from composite id ("P1@9.7")
      const lastAt = assemblyToSave.id.lastIndexOf("@");
      const assemblyCode =
        lastAt >= 0 ? assemblyToSave.id.slice(0, lastAt) : assemblyToSave.id;
      const heightFt =
        lastAt >= 0 ? parseFloat(assemblyToSave.id.slice(lastAt + 1)) : null;

      const overrideMaps = buildAssemblyOverrideMaps(assemblyToSave);

      const updatedCostingData = applyOverridesToCostingData(
        materialCostingDataRef.current,
        assemblyCode,
        heightFt,
        overrideMaps,
      );

      const res = await fetch(`/api/final-output/${finalOutputId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assemblies: updatedCostingData }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? "Failed to save");
      }

      // IMPORTANT: call onAssemblySaveComplete BEFORE the override syncs.
      // syncWasteOverrides / syncUnitCostOverrides call setOverrideMap, which triggers
      // useEffect([overrideMap]) in page.tsx. If materialCostingData hasn't been updated
      // yet at that point, the effect re-maps assemblies from stale data and reverts the
      // height override. Updating materialCostingData first ensures the effect sees the
      // correct data with height_ft_override already set.
      onAssemblySaveComplete?.(updatedCostingData);

      await syncWasteOverrides(assemblyToSave);
      await syncUnitCostOverrides(assemblyToSave);
    },
    [
      assembliesRef,
      finalOutputId,
      materialCostingDataRef,
      onAssemblySaveComplete,
      syncUnitCostOverrides,
      syncWasteOverrides,
    ],
  );

  return { handleSaveAssembly };
};

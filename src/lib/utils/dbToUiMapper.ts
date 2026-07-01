import { getWasteFactor, inferCategoryFromMaterial } from "@/constants";
import { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";
import { AssemblyComponent, TakeoffInstance, WallAssembly } from "@/types";
import { AssemblyData, MaterialCosting } from "@/types/assembly";

/** Assembly with final_output format fields (height_ft, total_length, etc.) */
interface FinalOutputAssembly extends MaterialCosting {
  assembly_type?: string;
  height_ft?: number;
  height_category?: string;
  level?: string;
  total_length?: number;
  ceiling_area?: number | null;
  area_parementer?: number | null;
}

/** Normalize assembly_type from takeoff to match category dropdown values */
const normalizeAssemblyType = (
  raw: string,
  assemblyId?: string,
): WallAssembly["assemblyType"] => {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("ceiling")) return "Ceiling";
  if (lower.includes("exterior")) return "Exterior Walls";
  if (lower.includes("interior")) return "Interior Walls";
  if (lower.includes("bulkhead")) return "BulkHead";
  if (lower.includes("access")) return "Access Pannel";
  if (lower.includes("hm") || lower.includes("hollow metal")) {
    return "HM Frames";
  }
  if (lower === "wall") {
    const id = String(assemblyId || "").toUpperCase();
    if (
      id.startsWith("WE") ||
      id.startsWith("WEF") ||
      id.includes("EF") ||
      /^E\d/.test(id)
    ) {
      return "Exterior Walls";
    }
    return "Interior Walls";
  }
  return (raw as WallAssembly["assemblyType"]) || "Interior Walls";
};

/** Normalize a unit_cost value from JSON/DB to a safe number or undefined.
 * Handles: number NaN, string "NaN" (PostgreSQL NaN via Supabase), null, undefined. */
const normalizeUnitCost = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Extract numeric spacing value from string or object format */
const resolveSpacingValue = (
  spacing: string | { unit?: string; value?: number } | null | undefined,
): number | null => {
  if (spacing == null) return null;
  if (typeof spacing === "object" && "value" in spacing) {
    const v = typeof spacing.value === "number" ? spacing.value : null;
    return v;
  }
  if (typeof spacing === "string") {
    const match = spacing.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
  return null;
};

/**
 * Maps JSON assembly data to WallAssembly format for the UI.
 * @param assemblyData - Array of assembly data from assembly-data JSON.
 * @param costingData - Array of costing data from material-match JSON.
 * @returns Array of WallAssembly objects.
 */
export const mapJsonToWallAssemblies = (
  assemblyData: AssemblyData[],
  costingData: MaterialCosting[],
): WallAssembly[] => {
  return assemblyData.map((assembly) => {
    const costing = costingData.find(
      (c) => c.assembly_id === assembly.assembly_id,
    );

    const components: AssemblyComponent[] = [];

    if (costing) {
      costing.materials_costing.forEach((item) => {
        const { extracted_material, matched_material, matched_labor } = item;

        if (!extracted_material?.raw_text) return;

        const rawText = extracted_material.raw_text;

        // Get OC from steel_framing if available (assembly_extractions format)
        // Fall back to extracted_material.spacing when assembly.materials is undefined (final_output format)
        const steelFraming = assembly.materials?.steel_framing?.find(
          (sf) => sf?.raw_text === rawText,
        );
        const spacingRaw =
          steelFraming?.spacing ?? extracted_material?.spacing ?? null;
        const spacingValue = resolveSpacingValue(spacingRaw);

        const hasSteelFramingMatch = assembly.materials?.steel_framing?.some(
          (sf) => sf?.raw_text === rawText,
        );
        const isSteelFraming =
          !!hasSteelFramingMatch ||
          /FURRING|STUD|TRACK|METAL STUDS/i.test(rawText) ||
          /FURRING|STUD|TRACK|METAL STUDS/i.test(
            String(extracted_material?.type ?? ""),
          );

        const spacingDisplay =
          spacingValue != null && spacingValue > 0
            ? `${Math.round(spacingValue / 25.4)}"`
            : isSteelFraming
              ? '16"'
              : "";

        const gypsumBoard = assembly.materials?.gypsum_board?.find(
          (gb) => gb?.raw_text === rawText,
        );
        const isGypsumBoard =
          !!gypsumBoard || /GYPSUM|WALLBOARD|DRYWALL|TYPE X/i.test(rawText);
        const layers = isGypsumBoard
          ? (gypsumBoard?.layers ?? extracted_material?.layers ?? undefined)
          : undefined;

        let usage = "Coverage (1 Layer)";
        if (spacingValue != null && spacingValue > 0) {
          const spacingInches = Math.round(spacingValue / 25.4);
          usage = `Vertical @ ${spacingInches}" OC`;
        } else if (isSteelFraming && !spacingRaw && !spacingValue) {
          usage = 'Vertical @ 16" OC';
        } else if (layers && layers > 1) {
          usage = `Coverage (${layers} Layers)`;
        }

        const heightFt =
          (extracted_material as { height_ft?: number })?.height_ft ??
          (assembly as { height_ft?: number })?.height_ft;

        const materialsToMap = matched_material != null ? [matched_material] : [];

        materialsToMap.forEach((material, idx) => {
          const category = inferCategoryFromMaterial(rawText, material.code);
          components.push({
            id: `${assembly.assembly_id}-mat-${idx}-${Date.now()}`,
            materialName: material.description,
            usage,
            wasteFactor: getWasteFactor(category),
            materialCost: material.unit_cost,
            overrideLayers: layers ?? undefined,
            overrideHeight: typeof heightFt === "number" ? heightFt : undefined,
            materialCode: material.code,
            sectionCode: material.section ?? "",
            ocSpacing: spacingDisplay || undefined,
            overrideQuantity:
              material.quantity != null && typeof material.quantity === "number"
                ? material.quantity
                : undefined,
            // JSON-embedded rows — primary source for resolver; DB lookup is fallback
            embeddedMatRow: material.material_row ?? undefined,
            embeddedLabRow: material.labour_row ?? undefined,
          });
        });

        // Labour rows: only create from matched_labor for OLD data (before new-architecture
        // match step). New data has matched_labor: [] — labour is derived at render time
        // by assemblyRowResolver using the material row's labour codes.
        if (matched_material == null) {
          (matched_labor ?? []).forEach((labor, idx) => {
            const laborHeightFt = (labor as { height_ft?: number }).height_ft;
            const displayHeight =
              typeof laborHeightFt === "number" ? laborHeightFt : heightFt;
            const laborHeightCategory = (labor as { height_category?: string })
              .height_category;
            const laborMuted = (labor as { muted?: boolean }).muted ?? false;
            const laborWaste =
              (labor as { waste_percent?: number }).waste_percent != null
                ? (labor as { waste_percent?: number }).waste_percent! / 100
                : 0;
            components.push({
              id: `${assembly.assembly_id}-lab-${idx}-${Date.now()}`,
              materialName: labor.description,
              usage,
              wasteFactor: laborWaste,
              materialCost: labor.unit_cost,
              overrideLayers: undefined,
              overrideHeight:
                typeof displayHeight === "number" ? displayHeight : undefined,
              heightCategory: laborHeightCategory ?? undefined,
              muted: laborMuted,
              materialCode: labor.code,
              sectionCode: labor.section ?? "",
              ocSpacing: spacingDisplay || undefined,
            });
          });
        }
      });
    }

    const extAssembly = assembly as AssemblyData;
    const costingExt = costing as FinalOutputAssembly | undefined;
    const rawType =
      costingExt?.assembly_type ?? extAssembly.assembly_type ?? "";
    const assemblyType = normalizeAssemblyType(
      rawType,
      extAssembly.assembly_id,
    );

    return {
      id: assembly.assembly_id,
      code: assembly.assembly_id,
      description: `Assembly ${assembly.assembly_id}`,
      components,
      assemblyType,
      defaultLength: extAssembly.total_length ?? 100,
      defaultHeight: extAssembly.height_ft ?? 10,
    };
  });
};

/**
 * Maps final_output assemblies to WallAssembly[] (one per assembly).
 * Use when materialData is from final output (each entry has total_length).
 */
export const mapFinalOutputToWallAssemblies = (
  costingData: (MaterialCosting | FinalOutputAssembly)[],
): WallAssembly[] => {
  const assemblies: WallAssembly[] = [];

  costingData.forEach((costing) => {
    const ext = costing as FinalOutputAssembly;
    const hasFinalFormat = typeof ext.total_length === "number" && ext.assembly_id != null;
    if (!hasFinalFormat) return;

    const assemblyId = ext.assembly_id;
    const totalLength = ext.total_length as number;
    const compositeId = assemblyId;

    const components: AssemblyComponent[] = [];
    let componentIdx = 0;

    (ext.materials_costing ?? []).forEach((item, groupIdx) => {
      const { extracted_material, matched_material, matched_labor } = item;
      if (!extracted_material?.raw_text) return;

      const rawText = extracted_material.raw_text;
      const spacingRaw = extracted_material?.spacing ?? null;
      const spacingValue = resolveSpacingValue(spacingRaw);
      const isSteelFraming =
        /FURRING|STUD|TRACK|METAL STUDS/i.test(rawText) ||
        /FURRING|STUD|TRACK|METAL STUDS/i.test(
          String(extracted_material?.type ?? ""),
        );
      const spacingDisplay =
        spacingValue != null && spacingValue > 0
          ? `${Math.round(spacingValue / 25.4)}"`
          : isSteelFraming
            ? '16"'
            : "";

      const isGypsumBoard = /GYPSUM|WALLBOARD|DRYWALL|TYPE X/i.test(rawText);
      const layers = isGypsumBoard
        ? (extracted_material?.layers ?? undefined)
        : undefined;

      let usage: string = "Coverage (1 Layer)";
      if (spacingValue != null && spacingValue > 0) {
        const spacingInches = Math.round(spacingValue / 25.4);
        usage = `Vertical @ ${spacingInches}" OC`;
      } else if (isSteelFraming && !spacingRaw && !spacingValue) {
        usage = 'Vertical @ 16" OC';
      } else if (layers && layers > 1) {
        usage = `Coverage (${layers} Layers)`;
      }

      const materialsToMap = matched_material != null ? [matched_material] : [];

      materialsToMap.forEach((material) => {
        const category = inferCategoryFromMaterial(rawText, material.code);
        const savedUsage = material.usage_override ?? usage;
        const savedLayers = material.layers_override ?? layers ?? undefined;
        const savedOc =
          material.oc_spacing_override ?? (spacingDisplay || undefined);
        const savedWaste =
          material.waste_percent != null
            ? material.waste_percent / 100
            : getWasteFactor(category);
        const savedLength = material.length_ft_override;

        components.push({
          id: `${compositeId}-mat-${componentIdx++}`,
          materialName: material.description,
          usage: savedUsage,
          wasteFactor: savedWaste,
          materialCost: normalizeUnitCost(material.unit_cost),
          overrideMatCost: normalizeUnitCost(material.unit_cost),
          overrideLayers: savedLayers,
          lengthOverride: savedLength,
          materialCode: material.code,
          sectionCode: material.section ?? "",
          ocSpacing: savedOc,
          groupId: groupIdx,
          overrideQuantity:
            material.quantity != null && typeof material.quantity === "number"
              ? material.quantity
              : undefined,
          // JSON-embedded rows — primary source for resolver; DB lookup is fallback
          embeddedMatRow: material.material_row ?? undefined,
          embeddedLabRow: material.labour_row ?? undefined,
        });
      });

      // Labour rows: only create from matched_labor for OLD data. New-architecture data has
      // matched_labor: [] — labour is derived at render time by assemblyRowResolver.
      if (matched_material == null) {
        (matched_labor ?? []).forEach((labor) => {
          const laborHeightCategory = (labor as { height_category?: string })
            .height_category;
          const laborMuted = (labor as { muted?: boolean }).muted ?? false;
          const laborWaste =
            labor.waste_percent != null ? labor.waste_percent / 100 : 0;
          components.push({
            id: `${compositeId}-lab-${componentIdx++}`,
            materialName: labor.description,
            usage,
            wasteFactor: laborWaste,
            materialCost: normalizeUnitCost(labor.unit_cost),
            overrideMatCost: normalizeUnitCost(labor.unit_cost),
            overrideLayers: undefined,
            heightCategory: laborHeightCategory ?? undefined,
            muted: laborMuted,
            materialCode: labor.code,
            sectionCode: labor.section ?? "",
            ocSpacing: spacingDisplay || undefined,
            groupId: groupIdx,
          });
        });
      }
    });

    const assemblyType = normalizeAssemblyType(
      ext.assembly_type ?? "",
      assemblyId,
    );

    assemblies.push({
      id: compositeId,
      code: compositeId,
      description: `Assembly ${assemblyId} (${totalLength} LF)`,
      components,
      assemblyType,
      defaultLength: totalLength,
    });
  });

  return assemblies;
};

/**
 * Maps final_output assemblies to TakeoffInstance records for the Takeoff Schedule.
 */
export const mapFinalOutputToTakeoffs = (
  assemblies: (MaterialCosting | FinalOutputAssembly)[],
): Record<string, TakeoffInstance[]> => {
  const result: Record<string, TakeoffInstance[]> = {};

  assemblies.forEach((asm) => {
    const ext = asm as FinalOutputAssembly;
    const hasFinalFormat = typeof ext.total_length === "number" && ext.assembly_id != null;

    if (!hasFinalFormat) return;

    const assemblyId = ext.assembly_id;
    const level = ext.level ?? "";
    const description = `Assembly ${assemblyId}`;
    const length = ext.total_length ?? 0;
    const ceilingArea = ext.ceiling_area ?? undefined;
    const perimeter = ext.area_parementer ?? undefined;

    const instance: TakeoffInstance = {
      id: `fo-${assemblyId}`,
      level,
      description,
      quantity: 1,
      length,
      ceilingArea,
      perimeter,
      lengthUnit: "LF",
      areaUnit: "SF",
    };

    if (!result[assemblyId]) result[assemblyId] = [];
    result[assemblyId].push(instance);
  });

  return result;
};

/**
 * Maps raw takeoff records (one per original Excel row) to TakeoffInstance records.
 * Unlike mapFinalOutputToTakeoffs, this preserves individual levels — no merging.
 * Used by TakeoffScheduleView so each row shows its own level.
 */
export const mapRawTakeoffToInstances = (
  rawRows: TakeoffRawRecord[],
  assemblies: (MaterialCosting | FinalOutputAssembly)[],
): Record<string, TakeoffInstance[]> => {
  const knownIds = new Set<string>();
  assemblies.forEach((asm) => {
    const ext = asm as FinalOutputAssembly;
    if (ext.assembly_id) knownIds.add(String(ext.assembly_id).trim());
  });

  const result: Record<string, TakeoffInstance[]> = {};

  rawRows.forEach((row, idx) => {
    if (!row.wall_type) return;
    const assemblyId = String(row.wall_type).trim();
    if (!knownIds.has(assemblyId)) return;

    const isCeiling =
      String(row.assembly_type ?? "").trim().toLowerCase() === "ceiling";
    const level = row.level != null ? String(row.level).trim() : "";
    const length = isCeiling ? 0 : row.wall_length ?? 0;
    const ceilingArea = isCeiling ? row.ceiling_area ?? undefined : undefined;
    const perimeter =
      row.area_parementer != null
        ? parseFloat(String(row.area_parementer)) || undefined
        : undefined;

    if (!result[assemblyId]) result[assemblyId] = [];
    result[assemblyId].push({
      id: `raw-${assemblyId}-${idx}`,
      level,
      description:
        row.description != null && String(row.description).trim() !== ""
          ? String(row.description).trim()
          : `Assembly ${assemblyId}`,
      quantity: 1,
      length,
      ceilingArea,
      perimeter,
      lengthUnit: isCeiling ? "SF" : "LF",
      areaUnit: "SF",
    });
  });

  return result;
};


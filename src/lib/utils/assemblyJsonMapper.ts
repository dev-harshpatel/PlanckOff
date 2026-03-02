import { AssemblyData, MaterialCosting } from "@/types/assemblyData";
import { AssemblyComponent, TakeoffInstance, WallAssembly } from "@/types";
import { TakeoffRawRecord } from "@/services/takeoff/parseRawTakeoff";

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
const normalizeAssemblyType = (raw: string): WallAssembly["assemblyType"] => {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("ceiling")) return "Ceiling";
  if (lower.includes("exterior")) return "Exterior Walls";
  if (lower.includes("interior")) return "Interior Walls";
  if (lower.includes("bulkhead")) return "BulkHead";
  if (lower.includes("access")) return "Access Pannel";
  if (lower.includes("hm") || lower.includes("hollow metal"))
    return "HM Frames";
  if (lower === "wall") return "Interior Walls";
  return (raw as WallAssembly["assemblyType"]) || "Interior Walls";
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
 * Maps JSON assembly data to WallAssembly format for the UI
 * @param assemblyData - Array of assembly data from assembly-data JSON
 * @param costingData - Array of costing data from material-match JSON
 * @returns Array of WallAssembly objects
 */
export const mapJsonToWallAssemblies = (
  assemblyData: AssemblyData[],
  costingData: MaterialCosting[],
): WallAssembly[] => {
  return assemblyData.map((assembly) => {
    const costing = costingData.find(
      (c) => c.assembly_id === assembly.assembly_id,
    );

    // Create components from the materials_costing data
    const components: AssemblyComponent[] = [];

    if (costing) {
      costing.materials_costing.forEach((item) => {
        const { extracted_material, matched_materials, matched_labor } = item;

        if (!extracted_material?.raw_text) return;

        const rawText = extracted_material.raw_text;

        // Get OC from steel_framing if available (assembly_extractions format)
        // Fall back to extracted_material.spacing when assembly.materials is undefined (final_output format)
        const steelFraming = assembly.materials?.steel_framing?.find(
          (sf) => sf?.raw_text === rawText,
        );
        const spacingRaw =
          steelFraming?.spacing ?? extracted_material?.spacing ?? null;
        // spacing can be string ("400 mm O.C."), object ({ unit: "mm", value: 400 }), or null
        const spacingValue = resolveSpacingValue(spacingRaw);

        // Check if this is steel framing/furring (OC applies)
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

        // Get layers from gypsum_board if available (assembly_extractions format)
        // Fall back to extracted_material.layers when assembly.materials is undefined (final_output format)
        // Layers only apply to gypsum board
        const gypsumBoard = assembly.materials?.gypsum_board?.find(
          (gb) => gb?.raw_text === rawText,
        );
        const isGypsumBoard =
          !!gypsumBoard || /GYPSUM|WALLBOARD|DRYWALL|TYPE X/i.test(rawText);
        const layers = isGypsumBoard
          ? (gypsumBoard?.layers ?? extracted_material?.layers ?? undefined)
          : undefined;

        // Determine usage based on material type
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

        // Add components for each matched material
        (matched_materials ?? []).forEach((material, idx) => {
          components.push({
            id: `${assembly.assembly_id}-mat-${idx}-${Date.now()}`,
            materialName: material.description,
            usage,
            wasteFactor: 0.05,
            materialCost: material.unit_cost,
            overrideLayers: layers ?? undefined,
            overrideHeight: typeof heightFt === "number" ? heightFt : undefined,
            materialCode: material.code,
            sectionCode: material.section ?? "",
            ocSpacing: spacingDisplay || undefined,
          });
        });

        // Add components for each matched labor (use per-segment height_ft when present)
        (matched_labor ?? []).forEach((labor, idx) => {
          const laborHeightFt = (labor as { height_ft?: number }).height_ft;
          const displayHeight = typeof laborHeightFt === "number" ? laborHeightFt : heightFt;
          components.push({
            id: `${assembly.assembly_id}-lab-${idx}-${Date.now()}`,
            materialName: labor.description,
            usage,
            wasteFactor: 0,
            materialCost: labor.unit_cost,
            overrideLayers: undefined,
            overrideHeight: typeof displayHeight === "number" ? displayHeight : undefined,
            materialCode: labor.code,
            sectionCode: labor.section ?? "",
            ocSpacing: spacingDisplay || undefined,
          });
        });
      });
    }

    const extAssembly = assembly as AssemblyData;
    const costingExt = costing as FinalOutputAssembly | undefined;
    // Prefer assembly_type from takeoff (final output) when available
    const rawType =
      costingExt?.assembly_type ?? extAssembly.assembly_type ?? "";
    const assemblyType = normalizeAssemblyType(rawType);

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
 * Build a stable composite id for final output assemblies (one per height).
 * e.g. "P1@9.7", "P1@10", "WEF1@15"
 */
export const getFinalOutputAssemblyKey = (
  assemblyId: string,
  heightFt: number,
): string => `${assemblyId}@${Number(heightFt)}`;

/**
 * Maps final_output assemblies to WallAssembly[] (one per assembly per height).
 * Use when materialData is from final output (each entry has height_ft, total_length).
 */
export const mapFinalOutputToWallAssemblies = (
  costingData: (MaterialCosting | FinalOutputAssembly)[],
): WallAssembly[] => {
  const assemblies: WallAssembly[] = [];

  costingData.forEach((costing) => {
    const ext = costing as FinalOutputAssembly;
    const hasFinalFormat =
      typeof ext.height_ft === "number" && typeof ext.total_length === "number";
    if (!hasFinalFormat) return;

    const assemblyId = ext.assembly_id;
    const heightFt = ext.height_ft as number;
    const totalLength = ext.total_length as number;
    const compositeId = getFinalOutputAssemblyKey(assemblyId, heightFt);

    const components: AssemblyComponent[] = [];
    let componentIdx = 0;

    (ext.materials_costing ?? []).forEach((item) => {
      const { extracted_material, matched_materials, matched_labor } = item;
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

      (matched_materials ?? []).forEach((material) => {
        components.push({
          id: `${compositeId}-mat-${componentIdx++}`,
          materialName: material.description,
          usage,
          wasteFactor: 0.05,
          materialCost: material.unit_cost,
          overrideLayers: layers ?? undefined,
          overrideHeight: heightFt,
          materialCode: material.code,
          sectionCode: material.section ?? "",
          ocSpacing: spacingDisplay || undefined,
        });
      });
      (matched_labor ?? []).forEach((labor) => {
        const laborHeightFt = (labor as { height_ft?: number }).height_ft;
        const displayHeight = typeof laborHeightFt === "number" ? laborHeightFt : heightFt;
        components.push({
          id: `${compositeId}-lab-${componentIdx++}`,
          materialName: labor.description,
          usage,
          wasteFactor: 0,
          materialCost: labor.unit_cost,
          overrideLayers: undefined,
          overrideHeight: displayHeight,
          materialCode: labor.code,
          sectionCode: labor.section ?? "",
          ocSpacing: spacingDisplay || undefined,
        });
      });
    });

    const assemblyType = normalizeAssemblyType(ext.assembly_type ?? "");

    assemblies.push({
      id: compositeId,
      code: compositeId,
      description: `Assembly ${assemblyId} (${heightFt}' : ${totalLength} LF)`,
      components,
      assemblyType,
      defaultLength: totalLength,
      defaultHeight: heightFt,
    });
  });

  return assemblies;
};

/**
 * Maps final_output assemblies to TakeoffInstance records for the Takeoff Schedule.
 * Keys by composite id (e.g. P1@9.7) when height_ft is present so each assembly-height has its own takeoffs.
 */
export const mapFinalOutputToTakeoffs = (
  assemblies: (MaterialCosting | FinalOutputAssembly)[],
): Record<string, TakeoffInstance[]> => {
  const result: Record<string, TakeoffInstance[]> = {};

  assemblies.forEach((asm) => {
    const ext = asm as FinalOutputAssembly;
    const hasFinalFormat =
      typeof ext.height_ft === "number" && typeof ext.total_length === "number";

    if (!hasFinalFormat) return;

    const assemblyId = ext.assembly_id;
    const heightFt = ext.height_ft ?? 0;
    const compositeKey = getFinalOutputAssemblyKey(assemblyId, heightFt);
    const level = ext.level ?? "";
    const description = `Assembly ${assemblyId}`;
    const length = ext.total_length ?? 0;
    const ceilingArea = ext.ceiling_area ?? undefined;
    const perimeter = ext.area_parementer ?? undefined;

    const instance: TakeoffInstance = {
      id: `fo-${compositeKey}`,
      level,
      description,
      quantity: 1,
      length,
      height: heightFt,
      ceilingArea,
      perimeter,
      lengthUnit: "LF",
      areaUnit: "SF",
    };

    if (!result[compositeKey]) result[compositeKey] = [];
    result[compositeKey].push(instance);
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
  // Build map: "wall_type|height" → compositeKey (e.g. "P1@9.7")
  const keyMap = new Map<string, string>();
  assemblies.forEach((asm) => {
    const ext = asm as FinalOutputAssembly;
    if (typeof ext.height_ft === "number" && ext.assembly_id) {
      const heightFt = Number(ext.height_ft);
      const k = `${String(ext.assembly_id).trim()}|${heightFt}`;
      keyMap.set(k, getFinalOutputAssemblyKey(ext.assembly_id, heightFt));
    }
  });

  const result: Record<string, TakeoffInstance[]> = {};

  rawRows.forEach((row, idx) => {
    if (!row.wall_type) return;
    const assemblyId = String(row.wall_type).trim();
    const heightFt = parseFloat(String(row.height ?? 0)) || 0;
    const k = `${assemblyId}|${heightFt}`;
    const compositeKey = keyMap.get(k);
    if (!compositeKey) return;

    const isCeiling =
      String(row.assembly_type ?? "").trim().toLowerCase() === "ceiling";
    const level = row.level != null ? String(row.level).trim() : "";
    const length = isCeiling ? 0 : (row.wall_length ?? 0);
    const ceilingArea = isCeiling ? (row.ceiling_area ?? undefined) : undefined;
    const perimeter =
      row.area_parementer != null
        ? parseFloat(String(row.area_parementer)) || undefined
        : undefined;

    if (!result[compositeKey]) result[compositeKey] = [];
    result[compositeKey].push({
      id: `raw-${compositeKey}-${idx}`,
      level,
      description: `Assembly ${assemblyId}`,
      quantity: 1,
      length,
      height: heightFt,
      ceilingArea,
      perimeter,
      lengthUnit: isCeiling ? "SF" : "LF",
      areaUnit: "SF",
    });
  });

  return result;
};

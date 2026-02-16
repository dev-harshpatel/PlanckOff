import { AssemblyData, MaterialCosting } from "@/types/assemblyData";
import { AssemblyComponent, TakeoffInstance, WallAssembly } from "@/types";

/** Assembly with final_output format fields (height_ft, total_length, etc.) */
interface FinalOutputAssembly extends MaterialCosting {
  assembly_type?: string;
  height_ft?: number;
  height_category?: string;
  total_length?: number;
  ceiling_area?: number | null;
  area_parementer?: number | null;
}

/** Normalize assembly_type from takeoff to match category dropdown values */
const normalizeAssemblyType = (
  raw: string,
): WallAssembly["assemblyType"] => {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("ceiling")) return "Ceiling";
  if (lower.includes("exterior")) return "Exterior Walls";
  if (lower.includes("interior")) return "Interior Walls";
  if (lower.includes("bulkhead")) return "BulkHead";
  if (lower.includes("access")) return "Access Pannel";
  if (lower.includes("hm") || lower.includes("hollow metal")) return "HM Frames";
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
          typeof spacingRaw === "string"
            ? spacingRaw
            : spacingValue != null
              ? `${spacingValue} mm O.C.`
              : isSteelFraming
                ? "16\""
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
          ? gypsumBoard?.layers ?? extracted_material?.layers ?? undefined
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

        // Add components for each matched labor
        (matched_labor ?? []).forEach((labor, idx) => {
          components.push({
            id: `${assembly.assembly_id}-lab-${idx}-${Date.now()}`,
            materialName: labor.description,
            usage,
            wasteFactor: 0,
            materialCost: labor.unit_cost,
            overrideLayers: undefined,
            overrideHeight: typeof heightFt === "number" ? heightFt : undefined,
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
 * Maps final_output assemblies to TakeoffInstance records for the Takeoff Schedule.
 * Only processes assemblies that have height_ft and total_length (final_output format).
 * Logs columns with missing data to console.
 */
export const mapFinalOutputToTakeoffs = (
  assemblies: (MaterialCosting | FinalOutputAssembly)[],
): Record<string, TakeoffInstance[]> => {
  const result: Record<string, TakeoffInstance[]> = {};
  const missingColumns: string[] = [];

  assemblies.forEach((asm) => {
    const ext = asm as FinalOutputAssembly;
    const hasFinalFormat =
      typeof ext.height_ft === "number" && typeof ext.total_length === "number";

    if (!hasFinalFormat) return;

    const assemblyId = ext.assembly_id;
    const level = ext.height_category ?? "";
    const description = `Assembly ${assemblyId}`;
    const length = ext.total_length ?? 0;
    const height = ext.height_ft ?? 0;
    const ceilingArea = ext.ceiling_area ?? undefined;
    const perimeter = ext.area_parementer ?? undefined;

    if (!level) missingColumns.push(`level (assembly ${assemblyId})`);
    if (length === 0) missingColumns.push(`length (assembly ${assemblyId})`);
    if (height === 0) missingColumns.push(`height (assembly ${assemblyId})`);

    const instance: TakeoffInstance = {
      id: "",
      level,
      description,
      quantity: 1,
      length,
      height,
      ceilingArea,
      perimeter,
      lengthUnit: "LF",
      areaUnit: "SF",
    };

    if (!result[assemblyId]) result[assemblyId] = [];
    const idx = result[assemblyId].length;
    instance.id = `fo-${assemblyId}-${idx}`;
    result[assemblyId].push(instance);
  });

  if (missingColumns.length > 0) {
    console.warn(
      "[Takeoff] Columns with missing/unmapped data:",
      [...new Set(missingColumns)],
    );
  }

  return result;
};

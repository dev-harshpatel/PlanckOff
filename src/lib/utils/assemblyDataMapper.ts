import {
  AssemblyData,
  MaterialCosting,
  MaterialDetailRow,
} from "@/types/assemblyData";

/**
 * Maps assembly and costing data to rows for display in the material details table
 * @param assemblyId - The assembly ID to map data for
 * @param assemblyData - Array of assembly data from assembly-data-1.json
 * @param costingData - Array of costing data from material-match-1.json
 * @returns Array of material detail rows ready for display
 */
export const mapAssemblyMaterialData = (
  assemblyId: string,
  assemblyData: AssemblyData[],
  costingData: MaterialCosting[],
): MaterialDetailRow[] => {
  const assembly = assemblyData.find((a) => a.assembly_id === assemblyId);
  const costing = costingData.find((c) => c.assembly_id === assemblyId);

  if (!assembly || !costing) return [];

  const rows: MaterialDetailRow[] = [];
  let rowIndex = 1;

  // Iterate through each extracted material
  costing.materials_costing.forEach((item) => {
    const { extracted_material, matched_materials, matched_labor } = item;
    const rawText = extracted_material?.raw_text ?? "";

    // Get OC from steel_framing if available (assembly_extractions format)
    // Fall back to extracted_material.spacing when assembly.materials is undefined (final_output format)
    const steelFraming = assembly.materials?.steel_framing?.find(
      (sf) => sf.raw_text === extracted_material.raw_text,
    );
    const spacingRaw =
      steelFraming?.spacing ?? extracted_material?.spacing ?? null;
    const isSteelFraming =
      !!steelFraming || /FURRING|STUD|TRACK|METAL STUDS/i.test(rawText);
    const oc =
      typeof spacingRaw === "string"
        ? spacingRaw
        : typeof spacingRaw === "object" && spacingRaw && "value" in spacingRaw
          ? `${spacingRaw.value ?? ""} mm O.C.`
          : isSteelFraming
            ? "16\""
            : "";

    // Get layers from gypsum_board only (not applicable to steel framing, labor)
    const gypsumBoard = assembly.materials?.gypsum_board?.find(
      (gb) => gb.raw_text === extracted_material.raw_text,
    );
    const isGypsum = !!gypsumBoard || /GYPSUM|WALLBOARD|DRYWALL|TYPE X/i.test(rawText);
    const layering = isGypsum ? (gypsumBoard?.layers ?? extracted_material?.layers ?? "") : "";

    const heightFt = (extracted_material as { height_ft?: number })?.height_ft ?? (assembly as { height_ft?: number })?.height_ft;
    const hgtStr = typeof heightFt === "number" ? `${heightFt}'` : "";

    // Add rows for matched materials
    matched_materials.forEach((material) => {
      rows.push({
        index: rowIndex++,
        assemblyCode: assemblyId,
        sect: material.section ?? "",
        description: material.description,
        code: material.code,
        hgt: hgtStr,
        oc,
        layering,
      });
    });

    // Add rows for matched labor
    matched_labor.forEach((labor) => {
      rows.push({
        index: rowIndex++,
        assemblyCode: assemblyId,
        sect: labor.section ?? "",
        description: labor.description,
        code: labor.code,
        hgt: hgtStr,
        oc,
        layering,
      });
    });
  });

  return rows;
};

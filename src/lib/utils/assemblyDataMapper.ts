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

    // Get OC from steel_framing if available
    const steelFraming = assembly.materials.steel_framing.find(
      (sf) => sf.raw_text === extracted_material.raw_text,
    );
    const oc = steelFraming?.spacing || "";

    // Get layers from gypsum_board if available
    const gypsumBoard = assembly.materials.gypsum_board.find(
      (gb) => gb.raw_text === extracted_material.raw_text,
    );
    const layering = gypsumBoard?.layers || "";

    // Add rows for matched materials
    matched_materials.forEach((material) => {
      rows.push({
        index: rowIndex++,
        assemblyCode: assemblyId,
        sect: "",
        description: material.description,
        code: material.code,
        hgt: "",
        oc,
        layering,
      });
    });

    // Add rows for matched labor
    matched_labor.forEach((labor) => {
      rows.push({
        index: rowIndex++,
        assemblyCode: assemblyId,
        sect: "",
        description: labor.description,
        code: labor.code,
        hgt: "",
        oc,
        layering,
      });
    });
  });

  return rows;
};

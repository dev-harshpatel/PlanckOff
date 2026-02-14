import { AssemblyData, MaterialCosting } from "@/types/assemblyData";
import { AssemblyComponent, WallAssembly } from "@/types";

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

        // Get OC from steel_framing if available
        const steelFraming = assembly.materials?.steel_framing?.find(
          (sf) => sf?.raw_text === rawText,
        );
        const spacingRaw = steelFraming?.spacing;
        // spacing can be string ("400 mm O.C."), object ({ unit: "mm", value: 400 }), or null
        const spacingValue = resolveSpacingValue(spacingRaw);
        const spacingDisplay =
          typeof spacingRaw === "string"
            ? spacingRaw
            : spacingValue != null
              ? `${spacingValue} mm O.C.`
              : "";

        // Get layers from gypsum_board if available
        const gypsumBoard = assembly.materials?.gypsum_board?.find(
          (gb) => gb?.raw_text === rawText,
        );
        const layers = gypsumBoard?.layers;

        // Determine usage based on material type
        let usage = "Coverage (1 Layer)";
        if (spacingValue != null && spacingValue > 0) {
          // Convert mm to inches if needed (400mm ≈ 16")
          const spacingInches = Math.round(spacingValue / 25.4);
          usage = `Vertical @ ${spacingInches}" OC`;
        } else if (layers && layers > 1) {
          usage = `Coverage (${layers} Layers)`;
        }

        // Add components for each matched material
        (matched_materials ?? []).forEach((material, idx) => {
          components.push({
            id: `${assembly.assembly_id}-mat-${idx}-${Date.now()}`,
            materialName: material.description,
            usage,
            wasteFactor: 0.05,
            materialCost: material.unit_cost,
            overrideLayers: layers || undefined,
            materialCode: material.code, // Store the code from JSON
            sectionCode: material.section ?? "", // From material_matches DB
            ocSpacing: spacingDisplay, // Store the OC spacing from JSON
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
            materialCode: labor.code, // Store the code from JSON
            sectionCode: labor.section ?? "", // From material_matches DB
            ocSpacing: spacingDisplay, // Store the OC spacing from JSON
          });
        });
      });
    }

    return {
      id: assembly.assembly_id,
      code: assembly.assembly_id,
      description: `Assembly ${assembly.assembly_id}`,
      components,
      assemblyType: "Wall",
      defaultLength: 100,
      defaultHeight: 10,
    };
  });
};

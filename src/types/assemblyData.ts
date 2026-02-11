/**
 * Type definitions for assembly extraction and material matching data
 */

export interface MaterialItem {
  raw_text: string;
  thickness: number | null;
  type: string | null;
  layers: number | null;
  size: string | null;
  gauge: string | null;
  spacing: string | null;
  description: string | null;
  r_value: string | null;
  depth: number | null;
}

export interface AssemblyMaterials {
  gypsum_board: MaterialItem[];
  gypsum_sheathing: MaterialItem[];
  steel_framing: MaterialItem[];
  insulation: MaterialItem[];
  plywood: MaterialItem[];
  blocking_and_bracing: MaterialItem[];
  steel_deck: MaterialItem[];
  vapor_barriers: MaterialItem[];
  sealants: MaterialItem[];
  trim_and_accessories: MaterialItem[];
}

export interface AssemblyData {
  assembly_id: string;
  fire_rating: string | null;
  stc_rating: string | null;
  materials: AssemblyMaterials;
}

export interface MatchedMaterial {
  code: string;
  section?: string;
  description: string;
  manufacturer: string;
  unit: string;
  unit_cost: number;
}

export interface MatchedLabor {
  code: string;
  section?: string;
  description: string;
  unit: string;
  unit_cost: number;
}

export interface MaterialsCostingItem {
  extracted_material: MaterialItem;
  matched_materials: MatchedMaterial[];
  matched_labor: MatchedLabor[];
}

export interface MaterialCosting {
  assembly_id: string;
  materials_costing: MaterialsCostingItem[];
}

export interface MaterialDetailRow {
  index: number;
  assemblyCode: string;
  sect: string;
  description: string;
  code: string;
  hgt: string;
  oc: string;
  layering: string | number;
}

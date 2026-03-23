/**
 * Assembly extraction and material matching data types
 */

export interface MaterialItem {
  raw_text: string;
  thickness?: number | { unit?: string; value?: number } | null;
  type: string | null;
  layers?: number | null;
  size: string | null;
  gauge: string | null;
  spacing?: string | { unit?: string; value?: number } | null;
  description: string | null;
  r_value?: string | null;
  depth?: number | null;
  height_ft?: number;
  height_category?: string;
  total_length?: number;
  ceiling_area?: number | null;
  area_parementer?: number | null;
  /** final_output format fields */
  selected_gauge?: string | null;
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
  fire_rating?: string | null;
  stc_rating?: string | null;
  materials?: AssemblyMaterials;
  assembly_type?: string;
  height_ft?: number;
  height_category?: string;
  total_length?: number;
  ceiling_area?: number | null;
  area_parementer?: number | null;
}

export interface MatchedMaterial {
  code: string;
  section?: string;
  description: string;
  manufacturer: string;
  unit: string;
  unit_cost: number;
  /** Stored quantity (computed at finalize) — single source of truth */
  quantity?: number;
  /** Stored secondary quantity (e.g. sheets from SF) */
  sec_quantity?: number;
  sec_unit?: string;
  /** Waste % used for this calculation */
  waste_percent?: number;
  // ─── Per-component user overrides (persisted via Assembly modal Save button) ───
  /** User-overridden height for this component */
  height_ft_override?: number;
  /** User-overridden calculation method/usage string (e.g. "Vertical @ 24\" OC") */
  usage_override?: string;
  /** User-overridden number of layers */
  layers_override?: number;
  /** User-overridden OC spacing display string (e.g. "24\"") */
  oc_spacing_override?: string;
}

export interface MatchedLabor {
  code: string;
  section?: string;
  description: string;
  unit: string;
  unit_cost: number;
  height_ft?: number;
  height_category?: string;
  /** Stored quantity */
  quantity?: number;
  /** Stored secondary quantity */
  sec_quantity?: number;
  sec_unit?: string;
  /** Waste % override saved via Assembly modal Save button */
  waste_percent?: number;
  /** UI mute state for labor rows that are irrelevant for selected material height */
  muted?: boolean;
}

export interface MaterialsCostingItem {
  extracted_material: MaterialItem | null;
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

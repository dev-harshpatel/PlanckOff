/**
 * Assembly extraction and material matching data types
 */
import type { MaterialDatabaseRow, LabourDatabaseRow } from '@/types/databases';

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
  /** User-overridden length (ft) for this line item */
  length_ft_override?: number;
  /** True when this row was matched from material_database (new rule-based system) */
  _fromNewDb?: boolean;
  // ─── New fields added in new-architecture match step ─────────────────────────
  /** Assembly bunch code — from material_database.assemblyCode (e.g. "DW-BX58") */
  assembly_code?: string;
  /** "Walls" | "Ceiling" | "Bulkhead" — drives wall vs ceiling formula selection */
  parent_section?: string;
  /** Labour code for wall context — from material_database.wallLabourCode */
  wall_labour_code?: string;
  /** Labour code for ceiling context — from material_database.ceilingLabourCode */
  ceiling_labour_code?: string;
  /** Labour code for bulkhead context — from material_database.bulkheadLabourCode */
  bulkhead_labour_code?: string;
  /**
   * Full material DB row embedded at match time. Primary source for formulas,
   * UOMs, sizes, and labour codes — assemblyRowResolver reads this first.
   * null = new-arch match but no embedding (shouldn't happen); undefined = old data.
   */
  material_row?: Omit<MaterialDatabaseRow, 'id' | 'deletedAt' | 'searchKeywords'> | null;
  /**
   * Full labour row for the selected assembly context (wall / ceiling / bulkhead).
   * Embedded at match time so render needs no live labourDb lookup.
   */
  labour_row?: Omit<LabourDatabaseRow, 'id' | 'deletedAt'> | null;
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
  /** True when this row was matched from labour_database (new rule-based system) */
  _fromNewDb?: boolean;
}

export interface MaterialsCostingItem {
  extracted_material: MaterialItem | null;
  /**
   * New architecture (new-architecture match step): single matched material row.
   * Populated by the rule-based matcher. Preferred over matched_materials[0].
   * null = no match found for this extracted item.
   */
  matched_material?: MatchedMaterial | null;
  /**
   * Legacy labour rows. Old matcher wrote these; new matcher omits them.
   * Labour is derived at render time by assemblyRowResolver from the matched
   * material's labour codes. Kept optional for backward compat with old DB data.
   */
  matched_labor?: MatchedLabor[];
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

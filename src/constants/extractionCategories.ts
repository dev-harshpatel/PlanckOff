// src/constants/extractionCategories.ts

/**
 * The 10 material categories the pipeline extracts and matches.
 * Order here = order in merged output (do not change without updating UI).
 */
export const EXTRACT_CATEGORIES = [
  'gypsum_board',
  'gypsum_sheathing',
  'steel_framing',
  'insulation',
  'vapor_barriers',
  'sealants',
  'plywood',
  'blocking_and_bracing',
  'steel_deck',
  'trim_and_accessories',
] as const;

export type ExtractCategory = typeof EXTRACT_CATEGORIES[number];

/**
 * Maps each extraction chunk ID → the categories it is responsible for.
 * Used by mergeExtractionChunks to know which category keys to copy from each chunk result.
 */
export const CHUNK_CATEGORY_MAP: Record<string, ExtractCategory[]> = {
  gypsum:           ['gypsum_board', 'gypsum_sheathing'],
  steel_framing:    ['steel_framing'],
  insulation:       ['insulation'],
  moisture_control: ['vapor_barriers', 'sealants'],
  wood_substrates:  ['plywood', 'blocking_and_bracing'],
  specialty:        ['steel_deck', 'trim_and_accessories'],
};

/**
 * Maps extraction category → DB category column values (spec_database.category).
 * Used by buildMaterialDbIndex to filter DB rows per category.
 * Keep in sync with actual category values in spec_database.
 */
export const CATEGORY_DB_MAP: Record<ExtractCategory, string[]> = {
  gypsum_board:         ['GWB', 'Drywall', 'Gypsum Board', 'Gypsum Wallboard'],
  gypsum_sheathing:     ['Gypsum Sheathing', 'Sheathing', 'Glass Mat Sheathing'],
  steel_framing:        ['Framing', 'Steel Framing', 'Light Gauge Framing', 'Metal Stud'],
  insulation:           ['Insulation', 'Batt Insulation', 'Spray Foam', 'Mineral Wool', 'Rock Wool'],
  vapor_barriers:       ['Vapor Barrier', 'Air Barrier', 'Polyethylene'],
  sealants:             ['Sealant', 'Acoustical Sealant', 'Firestop Sealant', 'Caulk'],
  plywood:              ['Plywood', 'OSB', 'Wood Panel', 'Wood Sheathing'],
  blocking_and_bracing: ['Blocking', 'Bracing', 'Wood Blocking', 'Solid Blocking'],
  steel_deck:           ['Steel Deck', 'Metal Deck', 'Roof Deck'],
  trim_and_accessories: ['Trim', 'Corner Bead', 'Control Joint', 'Accessories', 'J-Trim'],
};

/**
 * Semantic mapping: for each category, which DB column holds each physical property.
 * Used by the code scoring engine to know where to find thickness, depth, spacing, r_value.
 *
 * null = that property does not exist as a column for this category (look in description or skip).
 */
export const DB_FIELD_SEMANTICS: Record<ExtractCategory, {
  /** DB column that holds the thickness/size of this product */
  thickness: 'size' | 'width' | 'description' | null;
  /** DB column that holds the depth (stud cavity, framing depth) */
  depth: 'width' | 'size' | null;
  /** DB column that holds OC spacing */
  spacing: 'size' | 'screw_spacing' | null;
  /** Where R-value is stored */
  rValue: 'description' | null;
}> = {
  gypsum_board:         { thickness: 'size',  depth: null,    spacing: null,            rValue: null },
  gypsum_sheathing:     { thickness: 'size',  depth: null,    spacing: null,            rValue: null },
  steel_framing:        { thickness: null,     depth: 'width', spacing: 'size',          rValue: null },
  insulation:           { thickness: 'size',  depth: 'width', spacing: null,            rValue: 'description' },
  vapor_barriers:       { thickness: 'size',  depth: null,    spacing: null,            rValue: null },
  sealants:             { thickness: null,     depth: null,    spacing: null,            rValue: null },
  plywood:              { thickness: 'size',  depth: null,    spacing: null,            rValue: null },
  blocking_and_bracing: { thickness: 'size',  depth: 'width', spacing: null,            rValue: null },
  steel_deck:           { thickness: null,     depth: null,    spacing: 'screw_spacing', rValue: null },
  trim_and_accessories: { thickness: null,     depth: null,    spacing: null,            rValue: null },
};

/**
 * R-value lookup by stud cavity depth (inches).
 * Used when extracted insulation item has no r_value but has depth.
 * Source: ASHRAE / industry standard batt sizing.
 * Tolerance: ±0.25" for match.
 */
export const CAVITY_DEPTH_TO_RVALUE: Array<{ depthIn: number; rValue: number }> = [
  { depthIn: 3.5,  rValue: 11 },  // 2x4 stud (nominal)
  { depthIn: 3.625, rValue: 13 }, // 3-5/8" metal stud
  { depthIn: 4.0,  rValue: 13 },  // 4" stud
  { depthIn: 5.5,  rValue: 21 },  // 5-1/2" stud
  { depthIn: 6.0,  rValue: 19 },  // 6" stud
  { depthIn: 7.25, rValue: 25 },  // 7-1/4" stud
  { depthIn: 9.25, rValue: 30 },  // 9-1/4" stud
];

/**
 * Default steel framing gauge by wall height.
 * Source: USA baseline — IBC, ASTM C645, ASTM C955.
 */
export const HEIGHT_TO_GAUGE: Array<{ maxFt: number; gauge: string; milThickness: number }> = [
  { maxFt: 12,   gauge: '25', milThickness: 18 },
  { maxFt: 20,   gauge: '20', milThickness: 30 },
  { maxFt: 9999, gauge: '18', milThickness: 43 },
];

/** Returns the default gauge string (e.g. "25") for a given height in feet. */
export function getDefaultGaugeForHeight(heightFt: number): string {
  return HEIGHT_TO_GAUGE.find(h => heightFt <= h.maxFt)?.gauge ?? '18';
}

import { type ExtractCategory } from "@/constants/extractionCategories";
import type { MaterialDefinition } from "@/types";

export interface MaterialDbIndex {
  /** Material rows grouped by extraction category */
  byCategory: Record<ExtractCategory, MaterialDefinition[]>;
  /** All rows where category === 'Labor' */
  labor: MaterialDefinition[];
  /** Screw, fastener, anchor rows */
  fasteners: MaterialDefinition[];
}

const FASTENER_KEYWORDS = ["screw", "fastener", "anchor", "nail", "tek", "drywall screw"];

function isFastener(m: MaterialDefinition): boolean {
  const desc = (m.description ?? "").toLowerCase();
  return FASTENER_KEYWORDS.some(k => desc.includes(k));
}

/**
 * Build a category index from the full material DB in O(n).
 * Called once per match request — takes ~2ms for 1000 rows.
 *
 * Uses MaterialDefinition.category (typed union) for primary filtering.
 * "Other" catches vapor barriers, sealants, plywood, blocking.
 */
export function buildMaterialDbIndex(materials: MaterialDefinition[]): MaterialDbIndex {
  const nonLabor = materials.filter(m => m.category !== "Labor");

  const byCategory: Record<ExtractCategory, MaterialDefinition[]> = {
    gypsum_board:         nonLabor.filter(m => m.category === "Drywall"),
    gypsum_sheathing:     nonLabor.filter(m => m.category === "Drywall"),
    steel_framing:        nonLabor.filter(m => m.category === "Framing"),
    insulation:           nonLabor.filter(m => m.category === "Insulation"),
    vapor_barriers:       nonLabor.filter(m => m.category === "Other"),
    sealants:             nonLabor.filter(m => m.category === "Other"),
    plywood:              nonLabor.filter(m => m.category === "Other"),
    blocking_and_bracing: nonLabor.filter(m => m.category === "Other"),
    steel_deck:           nonLabor.filter(m => m.category === "Ceiling" || m.category === "Other"),
    trim_and_accessories: nonLabor.filter(m => m.category === "Finishing" || m.category === "Other"),
  };

  return {
    byCategory,
    labor: materials.filter(m => m.category === "Labor"),
    fasteners: nonLabor.filter(isFastener),
  };
}

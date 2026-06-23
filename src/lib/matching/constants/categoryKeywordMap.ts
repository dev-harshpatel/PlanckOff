import type { MaterialGroup } from '../types';

/**
 * Primary mapping: assembly extraction group → material_database.category.
 * This is the preferred signal — deterministic, no ambiguity.
 *
 * Category values must exactly match what is stored in material_database.category.
 * Current DB values: Drywall, FRAMING, INSULATION, SHEATHING, WOOD,
 *                    ACCESSORIES, FIRESTOP, FASTENER, FINISHING, CEILING, SPECIALTY
 */
export const GROUP_TO_CATEGORY: Record<MaterialGroup, string> = {
  gypsum_board:         'Drywall',
  gypsum_sheathing:     'SHEATHING',
  steel_framing:        'FRAMING',
  insulation:           'INSULATION',
  plywood:              'WOOD',
  blocking_and_bracing: 'FRAMING',
  steel_deck:           'FRAMING',
  vapor_barriers:       'ACCESSORIES',
  sealants:             'FIRESTOP',
  trim_and_accessories: 'ACCESSORIES',
};

/**
 * Fallback mapping: text patterns applied to raw_text when group key is unavailable.
 * Ordered from most-specific to most-general to reduce mis-classification.
 */
export const TEXT_CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /gypsum\s*(board|wallboard|panel|sheathing)/i, category: 'Drywall' },
  { pattern: /sheathing/i,                                  category: 'SHEATHING' },
  { pattern: /mineral\s*wool|roxul|rockwool/i,              category: 'INSULATION' },
  { pattern: /\b(batt|blanket)\s*insul/i,                   category: 'INSULATION' },
  { pattern: /insulation/i,                                 category: 'INSULATION' },
  { pattern: /(metal\s*)?(stud|track|channel|runner)/i,     category: 'FRAMING' },
  { pattern: /(steel|light.gauge)\s*fram/i,                 category: 'FRAMING' },
  { pattern: /plywood/i,                                    category: 'WOOD' },
  { pattern: /(acoustic|firestopp?ing|caulk|sealant)/i,    category: 'FIRESTOP' },
  { pattern: /(bead|trim|corner\s*guard|access)/i,          category: 'ACCESSORIES' },
  { pattern: /fastener|screw|nail|staple/i,                 category: 'FASTENER' },
  { pattern: /tape|compound|joint/i,                        category: 'FINISHING' },
];

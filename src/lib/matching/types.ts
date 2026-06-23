/**
 * Shared types for the rule-based matching pipeline (Phases 2–4).
 * No imports from the rest of the project — this file is self-contained.
 */

// ─── Assembly group keys ───────────────────────────────────────────────────────

/** Keys of the `materials` object on an extracted assembly. */
export type MaterialGroup =
  | 'gypsum_board'
  | 'gypsum_sheathing'
  | 'steel_framing'
  | 'insulation'
  | 'plywood'
  | 'blocking_and_bracing'
  | 'steel_deck'
  | 'vapor_barriers'
  | 'sealants'
  | 'trim_and_accessories';

// ─── Normalization output ─────────────────────────────────────────────────────

/**
 * Structured representation of a raw MaterialItem after normalization.
 * Produced by Phase 2 (`normalizeMaterialItem`).
 * Consumed by Phase 3 (scorer) to compare against material_database rows.
 */
export interface NormalizedMaterial {
  /** e.g. '5/8"' — derived from thickness/size */
  sizeImperial: string | null;
  /** e.g. 16 — raw mm value before lookup */
  sizeMM: number | null;
  /** e.g. 'Type X', 'Type C', 'Regular', 'MR' — null if not applicable */
  boardType: string | null;
  /** Matches material_database.category — e.g. 'Drywall', 'FRAMING', 'INSULATION' */
  category: string | null;
  /** Number of layers — defaults to 1 when not specified */
  layerCount: number;
  /** Steel gauge numeric string — e.g. '25', '20' (no 'ga' suffix) */
  gauge: string | null;
  /** OC spacing in mm — e.g. 400 for 400mm OC */
  spacingMM: number | null;
  /** OC spacing in imperial — e.g. '16"' */
  spacingImperial: string | null;
  /** De-duped lowercase tokens from all text fields — for Phase 3 keyword scoring */
  keywords: string[];
  /** Original raw_text from extraction — preserved for debugging */
  rawDescription: string;
}

// ─── Phase 3 types ────────────────────────────────────────────────────────────
// Full definitions live in matcher/types.ts — re-exported from matcher/index.ts

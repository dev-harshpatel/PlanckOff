/**
 * matchAssemblyMaterials.ts
 *
 * Branch classification + BOM expansion matcher.
 *
 * For each extracted assembly:
 *   1. normalizeExtractedAssembly → branch codes + sizes + types
 *   2. For each branch → load items from assembly_bunch_database
 *   3. XXXXXXX items → resolve by (category + size + type) from material_database
 *   4. Fixed codes → direct lookup by code in material_database
 *   5. Labour → from resolved material row's wallLabourCode/ceilingLabourCode
 *
 * Replaces the old per-item fuzzy scorer.
 */

import type { AssemblyData, MaterialItem, MaterialsCostingItem } from '@/types/assembly';
import type {
  MaterialDatabaseRow,
  LabourDatabaseRow,
  AssemblyBunchBranch,
  AssemblyBunchItem,
} from '@/types/databases';
import type { NormalizedAssembly } from '@/lib/utils/materialNormalizer';
import { normalizeExtractedAssembly } from '@/lib/utils/materialNormalizer';
import { resolveMatchedMaterial } from './resolveMatchedMaterial';
import { resolveMatchedLabour } from './resolveMatchedLabour';

// ─── Category map: which material_database category does each branch use? ─────

const BRANCH_CATEGORY: Record<string, string> = {
  'FR-WALL':          'FRAMING',
  'FR-CLG':           'FRAMING',
  'FR-BULK':          'FRAMING',
  'FR-SHAFT':         'FRAMING',
  'FR-SHAFT-CLG':     'FRAMING',
  'DW-SGL-WALL':      'Drywall',
  'DW-DBL-WALL':      'Drywall',
  'DW-SGL-CLG':       'Drywall',
  'DW-DBL-CLG':       'Drywall',
  'DW-SGL-BULK':      'Drywall',
  'DW-SGL-SHAFT':     'Drywall',
  'DW-DBL-SHAFT':     'Drywall',
  'DW-SGL-SHAFT-CLG': 'Drywall',
  'SH-WALL':          'SHEATHING',
  'SH-CLG':           'SHEATHING',
  'INS-WALL':         'INSULATION',
  'INS-CLG':          'INSULATION',
  'ACT-GRID-2X2':     'GRID',
  'ACT-GRID-2X4':     'GRID',
  'ACT-TILE':         'CEILING TILE',
  'GYP-GRID':         'GRID',
};

// ─── Placeholder resolution ────────────────────────────────────────────────────

/**
 * Get the target imperial size for XXXXXXX resolution based on the branch.
 * Board branches use boardSize, framing branches use framingSize, etc.
 */
function getTargetSize(branchCode: string, n: NormalizedAssembly): string | null {
  const cat = BRANCH_CATEGORY[branchCode];
  if (cat === 'Drywall' || cat === 'SHEATHING') return n.boardSizeImperial ?? n.sheathingSizeImperial;
  if (cat === 'FRAMING')     return n.framingSizeImperial;
  if (cat === 'INSULATION')  return n.insulationSizeImperial;
  return null;
}

/**
 * Convert a fractional imperial string like '3-5/8"' to its decimal equivalent (3.5").
 * Used for insulation cavity-depth matching against `size` column values.
 * Returns the decimal rounded to nearest 0.5 (e.g. 3.625 → 3.5).
 */
function imperialFractionToDecimal(imperial: string): number | null {
  const s = imperial.replace(/"/g, '').trim();
  const wholeAndFrac = s.match(/^(\d+)[-\s]+(\d+)\/(\d+)$/);
  if (wholeAndFrac) {
    const whole = parseInt(wholeAndFrac[1], 10);
    const num   = parseInt(wholeAndFrac[2], 10);
    const den   = parseInt(wholeAndFrac[3], 10);
    const exact = whole + num / den;
    // Round to nearest 0.5 (standard batt thickness increments)
    return Math.round(exact * 2) / 2;
  }
  const fracOnly = s.match(/^(\d+)\/(\d+)$/);
  if (fracOnly) {
    const exact = parseInt(fracOnly[1], 10) / parseInt(fracOnly[2], 10);
    return Math.round(exact * 2) / 2;
  }
  const wholeOnly = s.match(/^(\d+(?:\.\d+)?)$/);
  if (wholeOnly) return parseFloat(wholeOnly[1]);
  return null;
}

/**
 * Resolve an XXXXXXX placeholder to a concrete material_database row.
 *
 * Filters: category → size (in description) → type (in description) → hint
 * Returns null if nothing matches (item is skipped silently).
 *
 * NOTE: sizeImperial and type columns store product physical dimensions / generic category.
 * Profile size (board thickness, stud depth) and board type live in the description field.
 */
function resolvePlaceholder(
  bunchItem: AssemblyBunchItem,
  branchCode: string,
  normalized: NormalizedAssembly,
  materialRows: MaterialDatabaseRow[],
): MaterialDatabaseRow | null {
  const targetCategory = BRANCH_CATEGORY[branchCode];
  if (!targetCategory) return null;

  let candidates = materialRows.filter(r => r.category === targetCategory);
  if (candidates.length === 0) return null;

  // Size filter — search in description field (profile size is in description, not sizeImperial)
  // Skip size filter for INSULATION: insulation uses R-values, not profile dimensions
  const targetSize = getTargetSize(branchCode, normalized);
  if (targetSize && targetCategory !== 'INSULATION') {
    const sized = candidates.filter(r => r.description?.includes(targetSize));
    if (sized.length > 0) candidates = sized;
    // if no size match in description, fall through — better than null
  }

  // Board type filter (Drywall only) — search in description (type column holds "Drywall" not "Type X")
  if (targetCategory === 'Drywall' && normalized.boardType) {
    const typeStr = normalized.boardType.toLowerCase();
    const typed = candidates.filter(r => r.description?.toLowerCase().includes(typeStr));
    if (typed.length > 0) candidates = typed;
  }

  // Description sub-hint: e.g. bunchItem.description = 'Stud', 'Track', 'Batt'
  const descHint = bunchItem.description?.toLowerCase() ?? '';
  if (descHint.includes('stud') && targetCategory === 'FRAMING') {
    const studs = candidates.filter(r => r.description.toLowerCase().includes('stud'));
    if (studs.length > 0) candidates = studs;
  }
  if (descHint.includes('track') && targetCategory === 'FRAMING') {
    const tracks = candidates.filter(r => r.description.toLowerCase().includes('track'));
    if (tracks.length > 0) candidates = tracks;
  }
  if (descHint.includes('batt') && targetCategory === 'INSULATION') {
    // Prefer fibreglass/fiberglass batts — generic batt products for wall cavities
    const fibreBatts = candidates.filter(r =>
      r.description.toLowerCase().includes('batt') &&
      /fibre|fiber/i.test(r.description),
    );
    if (fibreBatts.length > 0) candidates = fibreBatts;
    else {
      const batts = candidates.filter(r => r.description.toLowerCase().includes('batt'));
      if (batts.length > 0) candidates = batts;
    }

    // Narrow by cavity depth using the `size` field (which stores dimensions like "3.5" x 15"...")
    // Convert fractional imperial (3-5/8") to its decimal equivalent (3.5") for comparison
    if (targetSize) {
      const decimalSize = imperialFractionToDecimal(targetSize);
      if (decimalSize !== null) {
        const sizedBatts = candidates.filter(r => r.size?.includes(`${decimalSize}"`));
        if (sizedBatts.length > 0) candidates = sizedBatts;
      }
    }
  }

  // For Drywall: prefer standard (non-specialty) by sorting on description length.
  // Specialty variants (Aqua Tough, SoundBreak, Moisture Resistant, etc.) have longer descriptions
  // than the plain standard product. Shortest description = most generic = better default.
  // For other categories: keep DB row_num order (already ascending from getAllMaterialRows).
  if (targetCategory === 'Drywall' && candidates.length > 1) {
    candidates = [...candidates].sort((a, b) => a.description.length - b.description.length);
  }

  return candidates[0] ?? null;
}

// ─── Synthetic item (for BOM-expanded entries that have no raw extracted item) ─

function syntheticItem(code: string, description: string): MaterialItem {
  return {
    raw_text: `[BOM] ${code} — ${description}`,
    type: null,
    gauge: null,
    size: null,
    description,
  };
}

// ─── Debug output ──────────────────────────────────────────────────────────────

export interface DebugMatchItem {
  assemblyId: string;
  branchCode: string;
  itemCode: string;
  description: string;
  result: 'matched' | 'placeholder_resolved' | 'unmatched';
  resolvedCode: string | null;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AssemblyMatchResult {
  costingItems: MaterialsCostingItem[];
  stats: {
    itemsTotal: number;
    itemsMatched: number;
    itemsUnmatched: number;
  };
  branchCodes: string[];
  debugItems: DebugMatchItem[];
}

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Match one extracted assembly by branch classification + BOM expansion.
 *
 * Steps:
 * 1. Normalize assembly → branch codes + sizes + types
 * 2. For each branch → load its items from assembly_bunch_database
 * 3. Resolve XXXXXXX placeholders via material_database lookup
 * 4. Look up fixed codes directly
 * 5. Get labour from resolved material's labour code
 */
export function matchAssemblyMaterials(
  assembly: AssemblyData,
  materialRows: MaterialDatabaseRow[],
  labourRows: LabourDatabaseRow[],
  bunchBranches: AssemblyBunchBranch[],
): AssemblyMatchResult {
  const normalized = normalizeExtractedAssembly(assembly);
  const costingItems: MaterialsCostingItem[] = [];
  const debugItems: DebugMatchItem[] = [];
  const stats = { itemsTotal: 0, itemsMatched: 0, itemsUnmatched: 0 };

  // Build fast lookup maps (avoids O(n) scans per item)
  const materialByCode = new Map<string, MaterialDatabaseRow>(
    materialRows.map(r => [r.code, r]),
  );
  const bunchByCode = new Map<string, AssemblyBunchBranch>(
    bunchBranches.map(b => [b.branchCode, b]),
  );

  for (const branchCode of normalized.branchCodes) {
    const branch = bunchByCode.get(branchCode);
    if (!branch) {
      // Branch exists in classification but has no DB rows — log and skip
      console.warn(`[matcher] Branch '${branchCode}' not found in assembly_bunch_database`);
      continue;
    }

    for (const bunchItem of branch.items) {
      // Skip layout-only separator rows (em dash item codes with no material)
      if (!bunchItem.itemCode || bunchItem.itemCode === '—' || bunchItem.itemCode === '-') continue;

      stats.itemsTotal++;

      // ── Resolve the material row ─────────────────────────────────────────────
      let resolved: MaterialDatabaseRow | null = null;
      let matchType: DebugMatchItem['result'] = 'unmatched';

      // Any all-X code is a placeholder (XXXXXXX, XXXXX, XXXX, etc.)
      const isPlaceholder = /^X+$/i.test(bunchItem.itemCode);
      if (isPlaceholder) {
        resolved = resolvePlaceholder(bunchItem, branchCode, normalized, materialRows);
        if (resolved) matchType = 'placeholder_resolved';
      } else {
        resolved = materialByCode.get(bunchItem.itemCode) ?? null;
        if (resolved) matchType = 'matched';
      }

      debugItems.push({
        assemblyId:   assembly.assembly_id,
        branchCode,
        itemCode:     bunchItem.itemCode,
        description:  bunchItem.description || bunchItem.itemCode,
        result:       matchType,
        resolvedCode: resolved?.code ?? null,
      });

      if (!resolved) {
        stats.itemsUnmatched++;
        // Still include a costing item so the assembly record is complete
        costingItems.push({
          extracted_material: syntheticItem(bunchItem.itemCode, bunchItem.description || bunchItem.itemCode),
          matched_materials: [],
          matched_labor: [],
        });
        continue;
      }

      stats.itemsMatched++;

      // ── Resolve labour code based on location ────────────────────────────────
      const labourCode = normalized.location === 'ceiling'
        ? resolved.ceilingLabourCode
        : normalized.location === 'bulkhead'
        ? resolved.bulkheadLabourCode
        : resolved.wallLabourCode;

      costingItems.push({
        extracted_material: syntheticItem(resolved.code, resolved.description),
        matched_materials:  [resolveMatchedMaterial(resolved)],
        matched_labor:       resolveMatchedLabour(labourCode, labourRows),
      });
    }
  }

  return { costingItems, stats, branchCodes: normalized.branchCodes, debugItems };
}

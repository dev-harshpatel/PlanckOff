/**
 * materialNormalizer.ts
 *
 * Pure utility functions for normalizing extracted assembly data before matching.
 * No React, no DB calls, no side effects — every function is independently testable.
 *
 * Used by: src/services/matching/matchAssemblyMaterials.ts
 */

import type { AssemblyData, MaterialItem } from '@/types/assembly';

// ─── mm → imperial lookup ──────────────────────────────────────────────────────

const MM_TO_IMPERIAL: Record<number, string> = {
  10:  '3/8"',
  13:  '1/2"',
  16:  '5/8"',
  19:  '3/4"',
  25:  '1"',
  38:  '1-1/2"',
  41:  '1-5/8"',
  51:  '2"',
  64:  '2-1/2"',
  76:  '3"',
  89:  '3-1/2"',
  92:  '3-5/8"',
  102: '4"',
  152: '6"',
  203: '8"',
};

function mmToImperial(mm: number): string | null {
  const keys = Object.keys(MM_TO_IMPERIAL).map(Number);
  const nearest = keys.reduce((prev, curr) =>
    Math.abs(curr - mm) < Math.abs(prev - mm) ? curr : prev,
  );
  if (Math.abs(nearest - mm) > 3) return null; // >3 mm gap = no standard match
  return MM_TO_IMPERIAL[nearest] ?? null;
}

/**
 * Convert a raw mm or imperial measurement to a standard imperial size string.
 * Handles: 16 (number), '16mm', '16 mm', '5/8"', '3-5/8"'
 */
export function normalizeToImperial(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;

  if (typeof raw === 'number') return mmToImperial(raw);

  const s = String(raw).trim();

  // Already imperial: '5/8"', '3-5/8"', '1-1/2"'
  if (s.includes('"') || /inch/i.test(s)) {
    const match = s.match(/([\d]+(?:[-\s][\d]+\/[\d]+|\/[\d]+)?)/);
    if (match) {
      const parts = match[1].split(/[-\s]/);
      let inches = 0;
      for (const p of parts) {
        if (p.includes('/')) {
          const [n, d] = p.split('/');
          inches += parseInt(n, 10) / parseInt(d, 10);
        } else if (p) {
          inches += parseFloat(p);
        }
      }
      return mmToImperial(inches * 25.4) ?? s;
    }
  }

  // mm string: '92mm', '92 mm'
  const mmMatch = s.match(/^(\d+(?:\.\d+)?)\s*mm/i);
  if (mmMatch) return mmToImperial(parseFloat(mmMatch[1]));

  return null;
}

/**
 * Normalize a board type string to its canonical DB value.
 * 'TYPE X', "TYPE 'X'", 'TX', 'FIRE RATED', standalone 'X' → 'Type X'
 * 'TYPE C', standalone 'C' → 'Type C'
 * 'MOISTURE RESISTANT', 'MR' → 'MR'
 * 'REGULAR' → 'Regular'
 */
export function normalizeBoardType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip single quotes (AI sometimes outputs "TYPE 'X'" with literal quotes)
  const s = raw.replace(/'/g, '').trim().toUpperCase();
  // Standalone 'X' or 'C' — AI extraction often outputs just the letter
  if (s === 'X' || /TYPE\s*X|\bTX\b/.test(s)) return 'Type X';
  if (s === 'C' || /TYPE\s*C/.test(s)) return 'Type C';
  if (/MOISTURE|MR\b/.test(s)) return 'MR';
  if (/ABUSE/.test(s)) return 'Abuse';
  if (/REGULAR|STD\b/.test(s)) return 'Regular';
  // Fire-rated without explicit type → assume Type X
  if (/FIRE/.test(s)) return 'Type X';
  return null;
}

/**
 * Map raw description text to a material_database CATEGORY value.
 * Returns null when category cannot be determined.
 */
export function mapToDBCategory(rawText: string): string | null {
  const s = rawText.toUpperCase();
  if (/GYPSUM|GWB|WALLBOARD|DRYWALL/.test(s)) return 'Drywall';
  if (/SHEATHING/.test(s)) return 'SHEATHING';
  if (/STUD|TRACK|CHANNEL|FRAMING|RUNNER/.test(s)) return 'FRAMING';
  if (/INSULATION|BATT|MINERAL\s*WOOL|ROXUL|ROCKWOOL/.test(s)) return 'INSULATION';
  if (/PLYWOOD/.test(s)) return 'WOOD';
  if (/CAULK|SEALANT|ACOUSTIC/.test(s)) return 'FIRESTOP';
  if (/BEAD|TRIM|CORNER|ANGLE/.test(s)) return 'ACCESSORIES';
  return null;
}

/**
 * Extract the number of layers from raw text.
 * '2 LAYER', 'DOUBLE LAYER', 'DBL LAYER' → 2
 * Default: 1
 */
export function extractLayerCount(rawText: string): number {
  const s = rawText.toUpperCase();
  const numMatch = s.match(/(\d+)\s*LAYER/);
  if (numMatch) return Math.max(1, parseInt(numMatch[1], 10));
  if (/DOUBLE\s*LAYER|DBL\s*LAYER|2\s*PLY/.test(s)) return 2;
  if (/TRIPLE\s*LAYER/.test(s)) return 3;
  return 1;
}

/**
 * Detect the physical location of an assembly from its assembly_type description.
 * Returns null when location cannot be determined (caller defaults to 'wall').
 */
export function extractLocation(
  rawText: string | null | undefined,
): 'wall' | 'ceiling' | 'bulkhead' | null {
  if (!rawText) return null;
  const s = rawText.toUpperCase();
  if (/BULKHEAD/.test(s)) return 'bulkhead';
  if (/CEILING|SOFFIT|OVERHEAD/.test(s)) return 'ceiling';
  if (/WALL|PARTITION/.test(s)) return 'wall';
  return null;
}

// ─── Size extraction from MaterialItem ────────────────────────────────────────

/**
 * Extract a normalized imperial size from a single MaterialItem.
 * Priority: thickness → size string → depth (insulation)
 */
function extractItemSize(item: MaterialItem): string | null {
  // Thickness: number or { value, unit }
  if (item.thickness != null) {
    if (typeof item.thickness === 'number') {
      return normalizeToImperial(item.thickness);
    }
    if (typeof item.thickness === 'string') {
      return normalizeToImperial(item.thickness as string);
    }
    if (typeof item.thickness === 'object' && item.thickness.value != null) {
      const mm = item.thickness.unit?.toLowerCase().startsWith('in')
        ? item.thickness.value * 25.4
        : item.thickness.value;
      return normalizeToImperial(mm);
    }
  }
  // Size string: '92mm', '3-5/8"'
  if (item.size) return normalizeToImperial(item.size);
  // Depth: insulation depth in mm
  if (typeof item.depth === 'number') return normalizeToImperial(item.depth);
  return null;
}

// ─── NormalizedAssembly ────────────────────────────────────────────────────────

export interface NormalizedAssembly {
  rawText: string;
  location: 'wall' | 'ceiling' | 'bulkhead' | null;
  boardSizeImperial: string | null;      // from gypsum_board → used for DW-* XXXXXXX
  boardType: string | null;              // 'Type X' | 'Type C' | etc.
  framingSizeImperial: string | null;    // from steel_framing → used for FR-* XXXXXXX
  insulationSizeImperial: string | null; // from insulation → used for INS-* XXXXXXX
  sheathingSizeImperial: string | null;  // from gypsum_sheathing → used for SH-* XXXXXXX
  layerCount: number;                    // max layers across board items
  branchCodes: string[];                 // output of classifyAssemblyBranches
  keywords: string[];                    // lowercased tokens for debug/logging
}

// ─── Branch classification ─────────────────────────────────────────────────────

/**
 * Classify an extracted assembly into assembly branch codes.
 *
 * Uses material group presence (already classified by extraction AI) plus
 * the assembly_type text for location. Deterministic — no thresholds.
 *
 * Branch codes correspond to rows in assembly_bunch_database.
 */
export function classifyAssemblyBranches(assembly: AssemblyData): string[] {
  const location = extractLocation(assembly.assembly_type);
  const effectiveLoc = location ?? 'wall';

  const hasFraming    = (assembly.materials?.steel_framing?.length ?? 0) > 0;
  const hasBoard      = (assembly.materials?.gypsum_board?.length ?? 0) > 0;
  const hasSheathing  = (assembly.materials?.gypsum_sheathing?.length ?? 0) > 0;
  const hasInsulation = (assembly.materials?.insulation?.length ?? 0) > 0;

  // Max layers across all board items (layer count from AI extraction)
  const maxLayers = (assembly.materials?.gypsum_board ?? []).reduce(
    (max, item) => Math.max(max, typeof item.layers === 'number' ? item.layers : 1),
    1,
  );

  const typeText = (assembly.assembly_type ?? '').toUpperCase();
  const isShaft  = /SHAFT/.test(typeText);
  const isACT    = /\bACT\b|T-BAR|SUSPENDED\s*CEILING|ACOUSTIC\s*TILE/.test(typeText);

  const branches: string[] = [];

  if (isShaft) {
    if (effectiveLoc === 'ceiling') {
      if (hasFraming) branches.push('FR-SHAFT-CLG');
      if (hasBoard)   branches.push('DW-SGL-SHAFT-CLG');
    } else {
      if (hasFraming) branches.push('FR-SHAFT');
      if (hasBoard)   branches.push(maxLayers >= 2 ? 'DW-DBL-SHAFT' : 'DW-SGL-SHAFT');
    }
    return branches;
  }

  if (effectiveLoc === 'ceiling') {
    if (isACT) {
      // ACT grid size from assembly_type text
      const is2x2 = /2\s*[Xx]\s*2/.test(typeText);
      branches.push(is2x2 ? 'ACT-GRID-2X2' : 'ACT-GRID-2X4');
      branches.push('ACT-TILE');
    } else if (/GYP.*GRID|GRID.*GYP/.test(typeText)) {
      branches.push('GYP-GRID');
    } else {
      if (hasFraming)    branches.push('FR-CLG');
      if (hasBoard)      branches.push(maxLayers >= 2 ? 'DW-DBL-CLG' : 'DW-SGL-CLG');
      if (hasSheathing)  branches.push('SH-CLG');
      if (hasInsulation) branches.push('INS-CLG');
    }
  } else if (effectiveLoc === 'bulkhead') {
    if (hasFraming) branches.push('FR-BULK');
    if (hasBoard)   branches.push('DW-SGL-BULK');
  } else {
    // wall (default)
    if (hasFraming)    branches.push('FR-WALL');
    if (hasBoard)      branches.push(maxLayers >= 2 ? 'DW-DBL-WALL' : 'DW-SGL-WALL');
    if (hasSheathing)  branches.push('SH-WALL');
    if (hasInsulation) branches.push('INS-WALL');
  }

  return branches;
}

// ─── Stopwords for keyword extraction ─────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'at', 'for', 'with', 'to', 'in', 'a', 'an', 'of',
  'mm', 'x', 'or', 'by', 'per', 'oc', 'type', 'on', 'is', 'from',
  'n/a', '', 'ga', 'ft', 'sf', 'lf',
]);

// ─── Master normalization function ────────────────────────────────────────────

/**
 * Normalize a full extracted assembly into the structured form used by the matcher.
 * Call once per assembly before branch expansion.
 */
export function normalizeExtractedAssembly(assembly: AssemblyData): NormalizedAssembly {
  const rawText = assembly.assembly_type ?? '';

  const boardItems     = assembly.materials?.gypsum_board ?? [];
  const framingItems   = assembly.materials?.steel_framing ?? [];
  const insulItems     = assembly.materials?.insulation ?? [];
  const sheathingItems = assembly.materials?.gypsum_sheathing ?? [];

  const firstBoard    = boardItems[0]     ?? null;
  const firstFraming  = framingItems[0]   ?? null;
  const firstInsul    = insulItems[0]     ?? null;
  const firstSheathing = sheathingItems[0] ?? null;

  const boardSizeImperial      = firstBoard    ? extractItemSize(firstBoard)    : null;
  const boardType              = firstBoard    ? normalizeBoardType(firstBoard.type) : null;
  const framingSizeImperial    = firstFraming  ? extractItemSize(firstFraming)  : null;
  const insulationSizeImperial = firstInsul    ? extractItemSize(firstInsul)    : null;
  const sheathingSizeImperial  = firstSheathing ? extractItemSize(firstSheathing) : null;

  const layerCount = boardItems.reduce(
    (max, item) => Math.max(max, typeof item.layers === 'number' ? item.layers : 1),
    1,
  );

  const branchCodes = classifyAssemblyBranches(assembly);
  const location    = extractLocation(assembly.assembly_type);

  // Collect keyword tokens for debug logs
  const allRawTexts = [
    rawText,
    ...boardItems.map(i => i.raw_text),
    ...framingItems.map(i => i.raw_text),
    ...insulItems.map(i => i.raw_text),
    ...sheathingItems.map(i => i.raw_text),
  ].filter(Boolean) as string[];

  const keywords = [...new Set(
    allRawTexts
      .join(' ')
      .toLowerCase()
      .split(/[\s\-/'"()+,]+/)
      .filter(t => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  )];

  return {
    rawText,
    location,
    boardSizeImperial,
    boardType,
    framingSizeImperial,
    insulationSizeImperial,
    sheathingSizeImperial,
    layerCount,
    branchCodes,
    keywords,
  };
}

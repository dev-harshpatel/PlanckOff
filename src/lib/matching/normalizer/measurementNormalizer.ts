import type { MaterialItem } from '@/types/assembly';
import { MM_TO_IMPERIAL, MM_SPACING_TO_IMPERIAL, mmToImperial } from '../constants/mmToImperial';

/** Regex to extract a leading mm value from a size string, e.g. "16mm" → 16 */
const MM_PATTERN = /^(\d+(?:\.\d+)?)\s*mm/i;

/** Regex to detect and extract an already-imperial measurement, e.g. '5/8"', '3-5/8"', "1-1/2'" */
const IMPERIAL_PATTERN = /([\d]+(?:[-\s][\d]+\/[\d]+|\/[\d]+)?)\s*["']/;

/**
 * Resolve the numeric mm value from the polymorphic `thickness` field.
 * thickness can be: number | { unit?: string; value?: number } | null | undefined
 */
function resolveThicknessMM(
  thickness: MaterialItem['thickness'],
): number | null {
  if (thickness == null) return null;
  if (typeof thickness === 'number') return thickness;
  if (typeof thickness === 'object') {
    const val = thickness.value ?? null;
    if (val == null) return null;
    // If unit is inches, convert to mm for consistent lookup
    if (thickness.unit?.toLowerCase().startsWith('in')) return val * 25.4;
    return val; // assume mm
  }
  // AI sometimes returns thickness as a plain string e.g. "16 mm", "5/8\"", "16mm"
  if (typeof thickness === 'string') {
    const mmMatch = (thickness as string).match(/^(\d+(?:\.\d+)?)\s*mm/i);
    if (mmMatch) return parseFloat(mmMatch[1]);
    // Inch string e.g. "5/8\"" — convert to mm
    const inchMatch = (thickness as string).match(/([\d]+(?:[-\s][\d]+\/[\d]+|\/[\d]+)?)\s*["']/);
    if (inchMatch) {
      const parts = inchMatch[1].split(/[-\s]/);
      let inches = 0;
      for (const p of parts) {
        if (p.includes('/')) {
          const [n, d] = p.split('/');
          inches += parseInt(n) / parseInt(d);
        } else {
          inches += parseFloat(p);
        }
      }
      return inches * 25.4;
    }
  }
  return null;
}

/**
 * Extract { sizeMM, sizeImperial } from a MaterialItem.
 *
 * Resolution order:
 * 1. thickness field (number or object form)
 * 2. size string — parsed for mm pattern
 * 3. depth field (insulation panels, in mm)
 * 4. size string — parsed for already-imperial pattern
 *
 * mm → imperial is resolved via MM_TO_IMPERIAL with ±2mm tolerance.
 * Formula: Source: parseMaterialDatabase.ts MM_TO_IMPERIAL lookup
 */
export function extractMeasurement(item: MaterialItem): {
  sizeMM: number | null;
  sizeImperial: string | null;
} {
  // Step 1: thickness field
  let sizeMM = resolveThicknessMM(item.thickness);

  // Step 2: parse mm from size string
  if (sizeMM == null && item.size) {
    const match = item.size.match(MM_PATTERN);
    if (match) sizeMM = parseFloat(match[1]);
  }

  // Step 3: depth as mm fallback (insulation)
  if (sizeMM == null && typeof item.depth === 'number') {
    sizeMM = item.depth;
  }

  // Resolve mm → imperial
  if (sizeMM != null) {
    const sizeImperial = mmToImperial(sizeMM, MM_TO_IMPERIAL);
    return { sizeMM, sizeImperial };
  }

  // Step 4: size string may already be in imperial (e.g. '5/8"', "3-5/8\"")
  if (item.size) {
    const match = item.size.match(IMPERIAL_PATTERN);
    if (match) {
      return { sizeMM: null, sizeImperial: match[0].trim() };
    }
  }

  return { sizeMM: null, sizeImperial: null };
}

/**
 * Extract { spacingMM, spacingImperial } from the spacing field.
 * Spacing can be a mm number or a string like "400mm OC", "16\" OC".
 * Used internally by spacingNormalizer.ts — exported here for reuse.
 */
export { MM_SPACING_TO_IMPERIAL };

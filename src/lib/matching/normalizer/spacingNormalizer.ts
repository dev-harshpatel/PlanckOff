import { MM_SPACING_TO_IMPERIAL, mmToImperial } from '../constants/mmToImperial';

/** Regex to extract mm value from a spacing string, e.g. "400mm OC" → 400 */
const MM_SPACING_PATTERN = /(\d+(?:\.\d+)?)\s*mm/i;

/** Regex to extract an already-imperial spacing value, e.g. '16" OC' */
const IMPERIAL_SPACING_PATTERN = /([\d]+(?:[-\/][\d]+)?)\s*["']\s*(?:oc|o\.c\.)?/i;

/**
 * Extract { spacingMM, spacingImperial } from the polymorphic spacing field.
 * spacing can be: string | { unit?: string; value?: number } | null | undefined
 *
 * Examples:
 *   "400mm OC"           → { spacingMM: 400, spacingImperial: '16"' }
 *   "600mm OC"           → { spacingMM: 600, spacingImperial: '24"' }
 *   '16" OC'             → { spacingMM: null, spacingImperial: '16"' }
 *   { unit: 'mm', value: 400 } → { spacingMM: 400, spacingImperial: '16"' }
 *   null                 → { spacingMM: null, spacingImperial: null }
 */
export function extractSpacing(
  raw: string | { unit?: string; value?: number } | null | undefined,
): { spacingMM: number | null; spacingImperial: string | null } {
  if (raw == null) return { spacingMM: null, spacingImperial: null };

  // Object form: { unit, value }
  if (typeof raw === 'object') {
    const val = raw.value ?? null;
    if (val == null) return { spacingMM: null, spacingImperial: null };

    if (raw.unit?.toLowerCase().startsWith('in')) {
      // Value is inches — convert to mm for consistency, then map back
      const mm = val * 25.4;
      return {
        spacingMM: Math.round(mm),
        spacingImperial: mmToImperial(Math.round(mm), MM_SPACING_TO_IMPERIAL) ?? `${val}"`,
      };
    }
    // Assume mm
    return {
      spacingMM: val,
      spacingImperial: mmToImperial(val, MM_SPACING_TO_IMPERIAL),
    };
  }

  // String form
  const mmMatch = raw.match(MM_SPACING_PATTERN);
  if (mmMatch) {
    const spacingMM = parseFloat(mmMatch[1]);
    return {
      spacingMM,
      spacingImperial: mmToImperial(spacingMM, MM_SPACING_TO_IMPERIAL),
    };
  }

  const impMatch = raw.match(IMPERIAL_SPACING_PATTERN);
  if (impMatch) {
    return { spacingMM: null, spacingImperial: `${impMatch[1]}"` };
  }

  return { spacingMM: null, spacingImperial: null };
}

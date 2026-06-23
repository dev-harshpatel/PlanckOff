/**
 * MM → imperial size lookup tables.
 * Sourced from scripts/parseMaterialDatabase.ts — keep in sync.
 */

/** Board/panel thickness: mm → imperial display string. */
export const MM_TO_IMPERIAL: Record<number, string> = {
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

/**
 * OC framing spacing: mm → imperial display string.
 * Covers standard drywall + framing spacing values.
 */
export const MM_SPACING_TO_IMPERIAL: Record<number, string> = {
  305: '12"',
  400: '16"',
  406: '16"',
  600: '24"',
  610: '24"',
};

/**
 * Resolve a raw mm value to its imperial string using the nearest key within ±2mm.
 * Returns null if no key is close enough.
 */
export function mmToImperial(
  mm: number,
  table: Record<number, string> = MM_TO_IMPERIAL,
): string | null {
  // Exact match first
  if (table[mm]) return table[mm];
  // Nearest within ±2mm
  const keys = Object.keys(table).map(Number);
  const closest = keys.reduce<number | null>((best, k) => {
    const dist = Math.abs(k - mm);
    if (dist > 2) return best;
    if (best === null) return k;
    return Math.abs(k - mm) < Math.abs(best - mm) ? k : best;
  }, null);
  return closest !== null ? table[closest] : null;
}

/**
 * Valid light-gauge steel values used in material_database.
 * Anything outside this set is treated as unrecognized.
 */
const VALID_GAUGES = new Set(['12', '14', '16', '18', '20', '22', '25']);

/** Regex to extract the leading numeric part from gauge strings. */
const GAUGE_EXTRACT = /^(\d{2})/;

/**
 * Normalize a raw gauge string to a plain numeric string.
 *
 * Examples:
 *   "25ga"     → "25"
 *   "20 gauge" → "20"
 *   "20GA"     → "20"
 *   "18G"      → "18"
 *   null       → null
 *   "heavy"    → null (not a recognized gauge number)
 *
 * Returns just the number (no 'ga' suffix) so it matches the format
 * used in material_database for direct equality checks in Phase 3.
 */
export function normalizeGauge(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(GAUGE_EXTRACT);
  if (!match) return null;

  const num = match[1];
  return VALID_GAUGES.has(num) ? num : null;
}

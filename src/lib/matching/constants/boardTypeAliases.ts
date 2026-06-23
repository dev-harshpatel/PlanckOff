/**
 * Board type pattern → canonical display string.
 * Canonical strings match the `type` column values in material_database.
 * Order matters: more specific patterns first to avoid false positives.
 */
export const BOARD_TYPE_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  // "TYPE 'X'", "type-x", "TYPE X", "TypeX"
  { pattern: /type\s*['"\-]?\s*x\b/i,     canonical: 'Type X' },
  // "TYPE 'C'", "type-c", "TYPE C"
  { pattern: /type\s*['"\-]?\s*c\b/i,     canonical: 'Type C' },
  // "MOISTURE RESISTANT", "MOISTURE-RESISTANT", "moisture resist"
  { pattern: /moisture[\s\-]?resist/i,     canonical: 'MR' },
  // Standalone "MR" as a word (avoid matching "frame" or similar)
  { pattern: /\bMR\b/,                     canonical: 'MR' },
  // "REGULAR", "STANDARD"
  { pattern: /\b(regular|standard)\b/i,    canonical: 'Regular' },
];

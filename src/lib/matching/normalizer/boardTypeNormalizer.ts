import { BOARD_TYPE_PATTERNS } from '../constants/boardTypeAliases';

/**
 * Normalize a raw board type string to its canonical form.
 *
 * Examples:
 *   "TYPE X"   → "Type X"
 *   "TYPE 'X'" → "Type X"
 *   "type-x"   → "Type X"
 *   "MOISTURE RESISTANT" → "MR"
 *   "regular"  → "Regular"
 *   null       → null
 *
 * Source: BOARD_TYPE_PATTERNS in constants/boardTypeAliases.ts
 */
export function normalizeBoardType(
  rawType: string | null | undefined,
): string | null {
  if (!rawType) return null;
  const trimmed = rawType.trim();
  if (!trimmed) return null;

  for (const { pattern, canonical } of BOARD_TYPE_PATTERNS) {
    if (pattern.test(trimmed)) return canonical;
  }

  return null;
}

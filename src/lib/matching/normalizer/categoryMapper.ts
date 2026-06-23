import { GROUP_TO_CATEGORY, TEXT_CATEGORY_PATTERNS } from '../constants/categoryKeywordMap';
import type { MaterialGroup } from '../types';

/**
 * Map a MaterialGroup key to its canonical material_database.category string.
 * Deterministic — always returns a non-null string.
 *
 * Source: GROUP_TO_CATEGORY in constants/categoryKeywordMap.ts
 */
export function mapGroupToCategory(group: MaterialGroup): string {
  return GROUP_TO_CATEGORY[group];
}

/**
 * Fallback: infer a material_database.category from raw description text.
 * Use only when the MaterialGroup is not available.
 * Returns null if no pattern matches.
 *
 * Source: TEXT_CATEGORY_PATTERNS in constants/categoryKeywordMap.ts
 */
export function mapTextToCategory(rawText: string): string | null {
  const text = rawText.trim();
  if (!text) return null;

  for (const { pattern, category } of TEXT_CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }

  return null;
}

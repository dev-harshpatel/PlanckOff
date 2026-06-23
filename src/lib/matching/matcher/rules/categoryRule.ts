import type { ScoringRule } from '../types';

/**
 * CATEGORY RULE
 *
 * Checks that the normalized material's category matches the database row's
 * category, and — for drywall — that the board type also matches.
 *
 * Scoring:
 *   1.0  — category matches AND board type matches (or board type is not applicable)
 *   0.6  — category matches but board type differs (e.g. Type X vs Regular)
 *   0.0  — category does not match (hard exclusion signal)
 *
 * Board type comparison is case-insensitive. A null board type on either side
 * is treated as "not applicable" — no penalty, category match is sufficient.
 *
 * Why 0.6 for category-only?
 * A wrong board type is a real mismatch (fire rating, cost, etc.) but the item
 * is still in the right product family. A partial score lets a correctly-typed
 * row beat a wrong-category row without completely hiding wrong-type rows from
 * the breakdown.
 */
export const categoryRule: ScoringRule = {
  name: 'category',
  description: 'Category match + board type (Type X / Type C / MR / Regular) match for drywall.',

  score(normalized, row): number {
    const normCat = normalized.category?.toUpperCase().trim();
    const rowCat  = row.category?.toUpperCase().trim();

    if (!normCat || !rowCat || normCat !== rowCat) return 0.0;

    // Category matched — now check board type for Drywall/SHEATHING families
    const normType = normalized.boardType?.toLowerCase().trim();
    const rowType  = row.type?.toLowerCase().trim();

    if (!normType || !rowType) return 1.0;  // one side has no type — not penalized
    return normType === rowType ? 1.0 : 0.6;
  },
};

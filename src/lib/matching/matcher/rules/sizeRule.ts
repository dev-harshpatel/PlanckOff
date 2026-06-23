import type { ScoringRule } from '../types';

/**
 * SIZE RULE
 *
 * Compares the normalized material's size (in mm and imperial) against the
 * database row's sizeMm and sizeImperial fields.
 *
 * Scoring:
 *   1.0  — exact mm match (sizeMM === row.sizeMm)
 *   0.8  — mm within ±1mm tolerance (manufacturing variance)
 *   0.6  — imperial string match when mm is unavailable on either side
 *   0.0  — no match
 *
 * Abstains (returns 0 without penalizing) when both sides have no size data,
 * because size is not meaningful for every category (e.g. sealants).
 */
export const sizeRule: ScoringRule = {
  name: 'size',
  description: 'Matches board/panel thickness or framing depth by mm value and imperial string.',

  score(normalized, row): number {
    const normMM = normalized.sizeMM;
    const rowMM  = row.sizeMm;

    // Both have mm values — prefer this path as it is most precise
    if (normMM !== null && rowMM !== null) {
      if (normMM === rowMM)                          return 1.0;
      if (Math.abs(normMM - rowMM) <= 1)            return 0.8;
      return 0.0;
    }

    // Fall back to imperial string comparison
    const normImp = normalized.sizeImperial?.trim().toLowerCase();
    const rowImp  = row.sizeImperial?.trim().toLowerCase();

    if (normImp && rowImp && normImp === rowImp)    return 0.6;

    // One or both sides have no size — abstain rather than penalize
    return 0.0;
  },
};

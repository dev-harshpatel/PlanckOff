import type { ScoringRule } from '../types';

/**
 * SIZE RULE
 *
 * Iterates all size entries in row.sizes[] and returns the best score found.
 *
 * Scoring per entry:
 *   1.0  — exact mm match
 *   0.8  — mm within ±1mm tolerance
 *   0.6  — imperial string match when mm unavailable
 *   0.0  — no match
 *
 * Abstains (returns 0) when the normalized material has no size data and no
 * size entries are defined, so size-irrelevant categories (e.g. sealants) are
 * not penalized.
 */
export const sizeRule: ScoringRule = {
  name: 'size',
  description: 'Matches board/panel thickness or framing depth by mm value and imperial string.',

  score(normalized, row): number {
    if (!row.sizes || row.sizes.length === 0) return 0.0;

    let best = 0.0;

    for (const entry of row.sizes) {
      const normMM = normalized.sizeMM;
      const rowMM  = entry.sizeMm;

      if (normMM !== null && rowMM !== null) {
        if (normMM === rowMM)                       { best = Math.max(best, 1.0); continue; }
        if (Math.abs(normMM - rowMM) <= 1)          { best = Math.max(best, 0.8); continue; }
      }

      const normImp = normalized.sizeImperial?.trim().toLowerCase();
      const rowImp  = entry.sizeImperial?.trim().toLowerCase();
      if (normImp && rowImp && normImp === rowImp)  best = Math.max(best, 0.6);
    }

    return best;
  },
};

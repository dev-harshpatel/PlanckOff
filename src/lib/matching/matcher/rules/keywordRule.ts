import type { ScoringRule } from '../types';

/**
 * KEYWORD RULE
 *
 * Measures overlap between the normalized material's keyword tokens and the
 * database row's searchKeywords array.
 *
 * Both sides are already lowercase (NormalizedMaterial.keywords from
 * keywordExtractor, material_database.search_keywords stored lowercase).
 *
 * Scoring formula:
 *   overlap = |normalized.keywords ∩ row.searchKeywords|
 *   score   = overlap / max(normalized.keywords.length, row.searchKeywords.length)
 *
 * Using the larger set as the denominator penalizes both over-broad DB keywords
 * and over-specific extractions — partial matches score proportionally.
 *
 * Returns 0 when either side has no keywords (cannot compare, abstain).
 */
export const keywordRule: ScoringRule = {
  name: 'keyword',
  description: 'Token overlap between extracted keywords and DB search_keywords[].',

  score(normalized, row): number {
    const normSet = normalized.keywords;
    const rowSet  = row.searchKeywords;

    if (normSet.length === 0 || rowSet.length === 0) return 0;

    const rowSetLower = new Set(rowSet.map(k => k.toLowerCase()));
    const overlap = normSet.filter(k => rowSetLower.has(k)).length;

    if (overlap === 0) return 0;

    const denominator = Math.max(normSet.length, rowSet.length);
    return overlap / denominator;
  },
};

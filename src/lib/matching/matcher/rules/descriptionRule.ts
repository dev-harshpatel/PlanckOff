import type { ScoringRule } from '../types';

/**
 * DESCRIPTION RULE
 *
 * Lightweight fuzzy check: does the DB row's description contain key tokens
 * from the normalized material's rawDescription?
 *
 * This acts as a tie-breaker when two rows have identical size/category/keyword
 * scores. It catches phrasing that made it through extraction but not into the
 * structured keyword list (e.g. brand names, product line suffixes).
 *
 * Scoring:
 *   Counts how many words from rawDescription (≥4 chars, not stopwords) appear
 *   anywhere in the DB row description. Score = matches / totalTokens, capped at 1.
 *
 * This rule carries a low weight in the registry so it only influences
 * tie-breaking, not primary matching.
 */

const MIN_TOKEN_LENGTH = 4;
const SPLIT_PATTERN    = /[\s\-\/'"()+,@]+/;
const SKIP_TOKENS      = new Set([
  'type', 'board', 'panel', 'wall', 'ceiling', 'with', 'from', 'this', 'that',
  'layer', 'gauge', 'size', 'inch', 'feet', 'nominal', 'approx',
]);

export const descriptionRule: ScoringRule = {
  name: 'description',
  description: 'Soft token match between rawDescription and DB row description (tie-breaker).',

  score(normalized, row): number {
    const raw = normalized.rawDescription;
    if (!raw) return 0;

    const tokens = raw
      .split(SPLIT_PATTERN)
      .map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length >= MIN_TOKEN_LENGTH && !SKIP_TOKENS.has(t));

    if (tokens.length === 0) return 0;

    const rowDesc = row.description.toLowerCase();
    const hits    = tokens.filter(t => rowDesc.includes(t)).length;

    return hits / tokens.length;
  },
};

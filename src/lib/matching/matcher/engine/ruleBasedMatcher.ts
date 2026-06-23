import type { NormalizedMaterial } from '../../types';
import type { MaterialDatabaseRow } from '@/types/databases';
import type { ScoredMatch } from '../types';
import { CONFIDENCE_THRESHOLDS } from '../rules/registry';
import { scoreOneRow } from './scoreOneRow';

/**
 * Entry point for Phase 3 matching.
 *
 * Takes a normalized material and the full candidate pool from material_database
 * and returns the single best match, or null if no row clears the minimum
 * confidence threshold.
 *
 * Strategy:
 *   1. Pre-filter: drop rows whose category provably cannot match (fast path).
 *   2. Score every remaining row with scoreOneRow().
 *   3. Sort by totalScore descending.
 *   4. Return the top row if it clears the minimum threshold; null otherwise.
 *
 * The top-N runners-up are included in the result so callers can inspect
 * near-misses and the breakdown for debugging / future UI display.
 */

export interface MatchResult {
  /** Best match, or null if nothing cleared the minimum threshold. */
  best: ScoredMatch | null;
  /** Top candidates including the winner (up to MAX_RUNNERS_UP + 1 entries). */
  candidates: ScoredMatch[];
  /** Number of rows scored (after pre-filter). */
  rowsScored: number;
}

const MAX_RUNNERS_UP = 4; // how many runners-up to keep in candidates[]

export function matchMaterial(
  normalized: NormalizedMaterial,
  allRows: MaterialDatabaseRow[],
): MatchResult {
  // ── Pre-filter: restrict to matching category when we have one ──────────────
  const pool = normalized.category
    ? allRows.filter(r => r.category.toUpperCase() === normalized.category!.toUpperCase())
    : allRows;

  // ── Score every row in the pool ─────────────────────────────────────────────
  const scored = pool
    .map(row => scoreOneRow(normalized, row))
    .sort((a, b) => b.totalScore - a.totalScore);

  const rowsScored = scored.length;
  const candidates = scored.slice(0, MAX_RUNNERS_UP + 1);

  // ── Apply minimum threshold ─────────────────────────────────────────────────
  const top = scored[0] ?? null;
  const minPct = CONFIDENCE_THRESHOLDS.low;

  if (!top || top.confidence === 'none') {
    return { best: null, candidates, rowsScored };
  }

  const topPct = top.maxPossibleScore > 0
    ? top.totalScore / top.maxPossibleScore
    : 0;

  if (topPct < minPct) {
    return { best: null, candidates, rowsScored };
  }

  return { best: top, candidates, rowsScored };
}

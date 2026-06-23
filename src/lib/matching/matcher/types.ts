import type { NormalizedMaterial } from '../types';
import type { MaterialDatabaseRow } from '@/types/databases';

// ─── Rule contract ────────────────────────────────────────────────────────────

/**
 * Every scoring rule implements this interface.
 *
 * To add a new rule:
 *   1. Create rules/<yourRule>.ts and export a ScoringRule object.
 *   2. Register it in rules/registry.ts with a weight.
 *   Done — the engine picks it up automatically.
 */
export interface ScoringRule {
  /** Short identifier shown in matchReasons, e.g. 'size-exact'. */
  name: string;
  /** Plain English: what signal does this rule check? */
  description: string;
  /**
   * Returns a score in [0, 1].
   * The engine multiplies this by the rule's weight from the registry.
   * Return 1 for a perfect match, 0 for no match, fractions for partial credit.
   */
  score(normalized: NormalizedMaterial, row: MaterialDatabaseRow): number;
}

// ─── Match result ─────────────────────────────────────────────────────────────

export interface RuleScore {
  ruleName: string;
  earned: number;    // points actually awarded
  max: number;       // max points this rule could award (= weight)
  detail: string;    // human-readable reason, e.g. 'size 16mm exact'
}

export interface ScoredMatch {
  row: MaterialDatabaseRow;
  totalScore: number;          // sum of earned across all rules
  maxPossibleScore: number;    // sum of all weights
  confidence: 'high' | 'medium' | 'low' | 'none';
  breakdown: RuleScore[];      // one entry per rule — full audit trail
}

// ─── Matcher config ───────────────────────────────────────────────────────────

export interface MatchConfig {
  /**
   * Minimum percentage of maxPossibleScore required to return any match.
   * Below this threshold → returns null (no confident match).
   * Default: 0.30 (30%)
   */
  minimumScorePct: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  minimumScorePct: 0.30,
};

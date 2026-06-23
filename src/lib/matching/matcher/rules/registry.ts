import { sizeRule }        from './sizeRule';
import { keywordRule }     from './keywordRule';
import { categoryRule }    from './categoryRule';
import { gaugeRule }       from './gaugeRule';
import { spacingRule }     from './spacingRule';
import { descriptionRule } from './descriptionRule';
import type { ScoringRule } from '../types';

// ─── Registered rules ─────────────────────────────────────────────────────────
//
// This is the SINGLE file you edit to change matching behaviour:
//
//   • Add a rule    → import it above, add an entry here
//   • Remove a rule → comment out or delete its entry
//   • Change weight → edit the weight field
//   • Change order  → reorder entries (order does NOT affect score, only breakdown display)
//
// Weights are absolute point values. The engine sums earned points across all
// rules and expresses confidence as (totalScore / maxPossibleScore).
//
// Rule          | Weight | What it checks
// ─────────────────────────────────────────────────────────────────────────────
// size          |   40   | Thickness/depth in mm or imperial (most decisive)
// keyword       |   30   | Token overlap with DB search_keywords[]
// category      |   20   | Category string + board type (Type X, MR, etc.)
// gauge         |   15   | Steel gauge — active only for framing items
// spacing       |   10   | OC spacing — active only when spacing is present
// description   |    5   | Soft raw-text token match (tie-breaker only)
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisteredRule {
  rule: ScoringRule;
  weight: number;
}

export const SCORING_RULES: RegisteredRule[] = [
  { rule: sizeRule,        weight: 40 },
  { rule: keywordRule,     weight: 30 },
  { rule: categoryRule,    weight: 20 },
  { rule: gaugeRule,       weight: 15 },
  { rule: spacingRule,     weight: 10 },
  { rule: descriptionRule, weight:  5 },
];

// ─── Confidence thresholds ────────────────────────────────────────────────────
//
// Expressed as a fraction of maxPossibleScore (sum of all weights = 120).
//
//   high   ≥ 60% — strong multi-signal agreement
//   medium ≥ 35% — category + at least one other signal agreed
//   low    ≥ 20% — weak match, returned but flagged
//   none    < 20% — not returned (matcher returns null)

export const CONFIDENCE_THRESHOLDS = {
  high:   0.60,
  medium: 0.35,
  low:    0.20,
} as const;

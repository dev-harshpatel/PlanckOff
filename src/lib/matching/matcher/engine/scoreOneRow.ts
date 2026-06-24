import type { NormalizedMaterial } from '../../types';
import type { MaterialDatabaseRow } from '@/types/databases';
import type { ScoredMatch, RuleScore } from '../types';
import { SCORING_RULES, CONFIDENCE_THRESHOLDS } from '../rules/registry';

/**
 * Apply every registered rule to a single DB row and return a fully annotated
 * ScoredMatch with a per-rule breakdown.
 *
 * This function never filters or sorts — it only scores one row.
 * Sorting and threshold filtering happen in ruleBasedMatcher.ts.
 */
export function scoreOneRow(
  normalized: NormalizedMaterial,
  row: MaterialDatabaseRow,
): ScoredMatch {
  let totalScore        = 0;
  let maxPossibleScore  = 0;
  const breakdown: RuleScore[] = [];

  for (const { rule, weight } of SCORING_RULES) {
    const fraction = rule.score(normalized, row);           // 0–1
    const earned   = Math.round(fraction * weight * 100) / 100; // 2dp precision

    maxPossibleScore += weight;
    totalScore       += earned;

    breakdown.push({
      ruleName: rule.name,
      earned,
      max: weight,
      detail: buildDetail(rule.name, fraction, earned, weight, normalized, row),
    });
  }

  const pct        = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
  const confidence = resolveConfidence(pct);

  return { row, totalScore, maxPossibleScore, confidence, breakdown };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveConfidence(pct: number): ScoredMatch['confidence'] {
  if (pct >= CONFIDENCE_THRESHOLDS.high)   return 'high';
  if (pct >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (pct >= CONFIDENCE_THRESHOLDS.low)    return 'low';
  return 'none';
}

function buildDetail(
  ruleName: string,
  fraction: number,
  earned: number,
  weight: number,
  normalized: NormalizedMaterial,
  row: MaterialDatabaseRow,
): string {
  if (fraction === 0) return `${ruleName}: no match (0/${weight})`;

  switch (ruleName) {
    case 'size':
      return fraction === 1.0
        ? `size: ${normalized.sizeMM ?? normalized.sizeImperial} exact (${earned}/${weight})`
        : `size: ~${normalized.sizeMM}mm ≈ ${row.sizes?.[0]?.sizeMm ?? '?'}mm tolerance (${earned}/${weight})`;

    case 'keyword': {
      const rowSet   = new Set(row.searchKeywords.map(k => k.toLowerCase()));
      const matched  = normalized.keywords.filter(k => rowSet.has(k));
      return `keyword: [${matched.slice(0, 4).join(', ')}${matched.length > 4 ? '…' : ''}] (${earned}/${weight})`;
    }

    case 'category':
      return fraction === 1.0
        ? `category: ${row.category} + type ${row.type ?? '—'} match (${earned}/${weight})`
        : `category: ${row.category} match, board type mismatch (${earned}/${weight})`;

    case 'gauge':
      return `gauge: ${normalized.gauge}ga matched in description (${earned}/${weight})`;

    case 'spacing':
      return `spacing: ${normalized.spacingImperial ?? normalized.spacingMM + 'mm'} OC matched (${earned}/${weight})`;

    case 'description':
      return `description: soft token match ${Math.round(fraction * 100)}% (${earned}/${weight})`;

    default:
      return `${ruleName}: ${earned}/${weight}`;
  }
}

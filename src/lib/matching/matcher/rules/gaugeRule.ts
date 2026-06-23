import type { ScoringRule } from '../types';

/**
 * GAUGE RULE
 *
 * Checks steel framing gauge match between the normalized material and the DB row.
 * Only active when the normalized material carries a gauge value — gauge is only
 * meaningful for steel framing (studs, tracks, runners).
 *
 * The DB does not have a dedicated gauge column; gauge is embedded in the
 * description (e.g. "25 GA STEEL STUD"). We extract it with a simple regex.
 *
 * Scoring:
 *   1.0  — gauge extracted from DB description matches normalized gauge exactly
 *   0.0  — gauge mismatch (wrong spec — this is a hard material error)
 *  abstain (0) — normalized material has no gauge (not a framing item)
 *
 * Why abstain instead of penalizing?
 * Non-framing items (drywall, insulation) legitimately have no gauge. Penalizing
 * them would unfairly disadvantage every non-framing DB row.
 */

const GAUGE_IN_DESCRIPTION = /\b(\d{2})\s*(?:ga|gauge)\b/i;

export const gaugeRule: ScoringRule = {
  name: 'gauge',
  description: 'Steel framing gauge match extracted from DB description vs normalized gauge.',

  score(normalized, row): number {
    // Abstain when gauge is not part of this material
    if (!normalized.gauge) return 0;

    const match = row.description.match(GAUGE_IN_DESCRIPTION);
    if (!match) return 0;

    const rowGauge = match[1]; // e.g. '25'
    return rowGauge === normalized.gauge ? 1.0 : 0.0;
  },
};

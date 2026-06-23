import type { ScoringRule } from '../types';

/**
 * SPACING RULE
 *
 * Matches OC (on-centre) framing spacing between the normalized material and
 * the DB row's description or searchKeywords.
 *
 * Spacing signals in the DB are embedded in descriptions like "400mm OC" or
 * keywords like ["400oc", "16oc"]. We check both.
 *
 * Scoring:
 *   1.0  — mm spacing found in DB description/keywords and matches exactly
 *   0.8  — imperial spacing string found and matches (e.g. '16"' in keywords)
 *   0.0  — spacing is present on normalized side but not found or mismatched
 *  abstain (0) — normalized material has no spacing (most board items)
 *
 * Why abstain?
 * Most DB rows don't carry spacing data. Penalizing a row for not having
 * spacing data when spacing is irrelevant to it would distort scores.
 */

const MM_OC_IN_TEXT    = /\b(\d{3,4})\s*mm\s*(?:oc|o\.c\.)/i;
const IMPERIAL_IN_TEXT = /\b(\d+(?:[-\/]\d+)?)["’]\s*(?:oc|o\.c\.)/i;

export const spacingRule: ScoringRule = {
  name: 'spacing',
  description: 'OC framing spacing match (mm or imperial) against DB description and keywords.',

  score(normalized, row): number {
    if (normalized.spacingMM === null && normalized.spacingImperial === null) return 0;

    const haystack = [row.description, ...row.searchKeywords].join(' ').toLowerCase();

    // Check mm spacing
    if (normalized.spacingMM !== null) {
      const mmMatch = haystack.match(MM_OC_IN_TEXT);
      if (mmMatch && parseInt(mmMatch[1], 10) === normalized.spacingMM) return 1.0;
    }

    // Check imperial spacing string
    if (normalized.spacingImperial) {
      const impToken = normalized.spacingImperial.replace('"', '').trim() + 'oc';
      if (haystack.includes(impToken)) return 0.8;

      const impMatch = haystack.match(IMPERIAL_IN_TEXT);
      if (impMatch) {
        const rowImp = `${impMatch[1]}"`;
        if (rowImp === normalized.spacingImperial) return 0.8;
      }
    }

    return 0.0;
  },
};

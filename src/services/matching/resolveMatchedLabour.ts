import type { LabourDatabaseRow } from '@/types/databases';
import type { MatchedLabor } from '@/types/assembly';

/**
 * Resolves all height-band variants for a given labour code from labour_database.
 *
 * At match time we don't know the actual wall height — that comes from the
 * takeoff in the finalize step. So we include ALL rows for the labour code,
 * ordered by htMinFt ascending. The finalize step picks the right band based
 * on actual height.
 *
 * Returns an empty array when:
 *   - labourCode is blank (material has no associated labour)
 *   - no rows match the code in the labour database
 */
export function resolveMatchedLabour(
  labourCode: string,
  allLabourRows: LabourDatabaseRow[],
): MatchedLabor[] {
  if (!labourCode) return [];

  const matching = allLabourRows
    .filter(r => r.labourCode === labourCode)
    .sort((a, b) => a.htMinFt - b.htMinFt);

  if (matching.length === 0) return [];

  return matching.map(row => ({
    code:           row.labourCode,
    section:        row.category || undefined,
    description:    row.description,
    unit:           row.uom,
    unit_cost:      row.ratePerUom,
    height_ft:      row.htMinFt,
    height_category: row.htBand,
    _fromNewDb:     true,
  }));
}

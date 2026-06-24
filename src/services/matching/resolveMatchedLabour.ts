import type { LabourDatabaseRow } from '@/types/databases';
import type { MatchedLabor } from '@/types/assembly';

/**
 * Resolves all height-band variants for a given labour code from labour_database.
 *
 * Each row's labourBands array is searched for entries matching labourCode.
 * At match time we don't know the actual wall height — that comes from the
 * takeoff in the finalize step. So we include ALL matching bands, ordered by
 * htMinFt ascending. The finalize step picks the right band based on height.
 */
export function resolveMatchedLabour(
  labourCode: string,
  allLabourRows: LabourDatabaseRow[],
): MatchedLabor[] {
  if (!labourCode) return [];

  const matched: Array<{
    labourCode: string;
    htBand: string;
    htMinFt: number;
    uom: string;
    ratePerUom: number;
    description: string;
    category: string;
  }> = [];

  for (const row of allLabourRows) {
    for (const band of row.labourBands) {
      if (band.labourCode === labourCode) {
        matched.push({
          labourCode: band.labourCode,
          htBand: band.htBand,
          htMinFt: band.htMinFt,
          uom: band.uom,
          ratePerUom: band.ratePerUom,
          description: row.description,
          category: row.category,
        });
      }
    }
  }

  if (matched.length === 0) return [];

  return matched
    .sort((a, b) => a.htMinFt - b.htMinFt)
    .map(band => ({
      code:            band.labourCode,
      section:         band.category || undefined,
      description:     band.description,
      unit:            band.uom,
      unit_cost:       band.ratePerUom,
      height_ft:       band.htMinFt,
      height_category: band.htBand,
      _fromNewDb:      true,
    }));
}

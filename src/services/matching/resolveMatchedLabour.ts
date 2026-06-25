import type { LabourDatabaseRow } from '@/types/databases';
import type { MatchedLabor } from '@/types/assembly';

/**
 * Resolves all height-band variants for a given parent labour code.
 *
 * The material DB stores parent codes (e.g. LAB-FRM) in wall/ceiling/bulkhead
 * labour code fields. Each parent row holds all its child bands in labourBands[].
 * We return ALL bands so the finalize step can pick the right one by wall height.
 */
export function resolveMatchedLabour(
  labourCode: string,
  allLabourRows: LabourDatabaseRow[],
): MatchedLabor[] {
  if (!labourCode) return [];

  // Find the parent row whose parentCode matches
  const parentRow = allLabourRows.find((r) => r.parentCode === labourCode);
  if (!parentRow) return [];

  return parentRow.labourBands
    .slice()
    .sort((a, b) => a.htMinFt - b.htMinFt)
    .map((band) => ({
      code:            band.labourCode,
      section:         parentRow.category || undefined,
      description:     band.description || parentRow.description,
      unit:            band.uom,
      unit_cost:       band.ratePerUom,
      height_ft:       band.htMinFt,
      height_category: band.htBand,
      _fromNewDb:      true,
    }));
}

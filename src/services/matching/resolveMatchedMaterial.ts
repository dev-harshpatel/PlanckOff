import type { MaterialDatabaseRow } from '@/types/databases';
import type { MatchedMaterial } from '@/types/assembly';

/**
 * Converts a matched material_database row into the MatchedMaterial shape
 * consumed by the finalize step and the reports layer.
 *
 * unit falls back to the first size entry's containerUnit when uom1 is absent.
 */
export function resolveMatchedMaterial(row: MaterialDatabaseRow): MatchedMaterial {
  return {
    code:         row.code,
    section:      row.section || undefined,
    description:  row.description,
    manufacturer: '',
    unit:         row.uom1 || row.sizes?.[0]?.containerUnit || 'EA',
    unit_cost:    row.unitPrice,
    _fromNewDb:   true,
  };
}

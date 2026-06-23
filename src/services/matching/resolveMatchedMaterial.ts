import type { MaterialDatabaseRow } from '@/types/databases';
import type { MatchedMaterial } from '@/types/assembly';

/**
 * Converts a matched material_database row into the MatchedMaterial shape
 * consumed by the finalize step and the reports layer.
 *
 * unit_cost comes from row.unitPrice (the DB price).
 * unit prefers the wall UOM (uom1); the finalize step picks qty formulas.
 * qty1Formula is stored so the finalize step can evaluate it against takeoff dims.
 */
export function resolveMatchedMaterial(row: MaterialDatabaseRow): MatchedMaterial {
  return {
    code:         row.code,
    section:      row.section || undefined,
    description:  row.description,
    manufacturer: '',
    unit:         row.uom1 || row.containerUnit || 'EA',
    unit_cost:    row.unitPrice,
    _fromNewDb:   true,
  };
}

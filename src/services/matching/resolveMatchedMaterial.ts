import type { MaterialDatabaseRow, LabourDatabaseRow } from '@/types/databases';
import type { MatchedMaterial } from '@/types/assembly';

export type AssemblyContext = 'wall' | 'ceiling' | 'bulkhead';

/**
 * Derives assembly context from the assembly_type string coming from the Excel takeoff.
 * - "Ceiling" → ceiling
 * - "Bulkhead" → bulkhead
 * - "Interior Wall", "Exterior Wall", anything else → wall
 */
export function getAssemblyContext(assemblyType: string | null | undefined): AssemblyContext {
  const lower = (assemblyType ?? '').toLowerCase();
  if (lower.includes('ceiling'))  return 'ceiling';
  if (lower.includes('bulkhead')) return 'bulkhead';
  return 'wall';
}

/**
 * Picks the correct labour code from the material row based on assembly context.
 * Context comes from the Excel takeoff category (Interior/Exterior Wall → wall,
 * Ceiling → ceiling, Bulkhead → bulkhead).
 */
function selectLabourCodeForContext(row: MaterialDatabaseRow, ctx: AssemblyContext): string {
  if (ctx === 'ceiling')  return row.ceilingLabourCode  || '';
  if (ctx === 'bulkhead') return row.bulkheadLabourCode || '';
  return row.wallLabourCode || '';
}

/**
 * Converts a matched material_database row into the MatchedMaterial shape.
 *
 * assemblyContext drives which of the three labour codes (wall/ceiling/bulkhead)
 * is used for the `labour_row` embed. This context comes from the assembly's
 * category in the Excel takeoff (Interior Wall → wall, Ceiling → ceiling, etc.).
 *
 * All three raw labour codes are still stored in the output for reference.
 * `labour_row` holds the fully embedded labour DB row for the selected code,
 * making the final JSON self-contained (no live labourDb lookup needed at render time).
 */
export function resolveMatchedMaterial(
  row: MaterialDatabaseRow,
  labourRows?: LabourDatabaseRow[],
  assemblyContext: AssemblyContext = 'wall',
): MatchedMaterial {
  const selectedLabourCode = selectLabourCodeForContext(row, assemblyContext) || undefined;

  let labourRow: MatchedMaterial['labour_row'] = null;
  if (selectedLabourCode && labourRows?.length) {
    const lower = selectedLabourCode.toLowerCase();
    // Two-pass: parent code first (multi-band), then band code (single-band)
    const found =
      labourRows.find(r => r.parentCode.toLowerCase() === lower) ??
      labourRows.find(r => r.labourBands.some(b => b.labourCode.toLowerCase() === lower));
    if (found) {
      labourRow = {
        parentCode:    found.parentCode,
        parentSection: found.parentSection,
        description:   found.description,
        category:      found.category,
        qty1Formula:   found.qty1Formula,
        qty1Uom:       found.qty1Uom,
        labourBands:   found.labourBands,
        notes:         found.notes,
      };
    }
  }

  // Embed the full material DB row so the final JSON is self-contained.
  // Omit admin-only fields that aren't needed at render time.
  const { id: _id, deletedAt: _del, searchKeywords: _kw, ...materialRow } = row;

  return {
    code:                 row.code,
    section:              row.section || undefined,
    description:          row.description,
    manufacturer:         '',
    unit:                 row.uom1 || row.sizes?.[0]?.containerUnit || 'EA',
    unit_cost:            row.unitPrice,
    _fromNewDb:           true,
    assembly_code:        row.assemblyCode || undefined,
    parent_section:       row.parentSection || undefined,
    wall_labour_code:     row.wallLabourCode     || undefined,
    ceiling_labour_code:  row.ceilingLabourCode  || undefined,
    bulkhead_labour_code: row.bulkheadLabourCode || undefined,
    material_row:         materialRow,
    labour_row:           labourRow,
  };
}

/**
 * Types for the centralized assembly row resolver.
 * Every column in the assembly model table reads from ResolvedAssemblyRow —
 * no component computes column values on its own.
 *
 * Context is determined by the MATCHED MaterialDatabaseRow.parentSection,
 * not by assembly.assemblyType. The AI pipeline sets parentSection at match time.
 */

export interface AssemblyRowContext {
  isCeiling: boolean;
  isBulkhead: boolean;
  isWall: boolean;
}

export interface ResolvedLabour {
  parentCode: string;   // e.g. "LAB-FRM" — shown in Labour Code column
  bandCode: string;     // e.g. "LAB-FRM-STD" — the matched height band
  labQty: number | null;
  labUom: string;       // from band.qty1Uom
  labUnitRate: number;  // from band.ratePerUom — shown in Lab. Unit $ column
  totalLabCost: number; // labUnitRate × labQty
}

export interface ResolvedAssemblyRow {
  // Identification columns
  section: string;          // from MaterialDatabaseRow.section
  materialCode: string;     // from MaterialDatabaseRow.code
  description: string;      // from AssemblyComponent.materialName (AI extraction)

  // Spec columns (display-only; sourced from assembly / component overrides)
  oc: string;               // e.g. "16\""

  // Labour Code column
  labourCode: string;       // selected from wall/ceiling/bulkhead based on parentSection

  // Quantity columns
  wastePct: number;         // default 5; editable via comp.wasteFactor
  qty1: number | null;      // evaluated from context formula (wall or ceiling)
  uom1: string;             // from MaterialDatabaseRow.uom1 / uom1Ceiling
  qty2: number | null;      // evaluated from context formula (wall or ceiling)
  uom2: string;             // from MaterialDatabaseRow.uom2 / uom2Ceiling
  size: number | null;      // QTY1 / sizes[0].sizeNum

  // Labour columns
  labour: ResolvedLabour | null;

  // Cost columns
  matUnitPrice: number;     // from MaterialDatabaseRow.unitPrice
  totalMatCost: number;     // matUnitPrice × qty2
  totalLabCost: number;     // labour.labUnitRate × labour.labQty
  totalCost: number;        // totalMatCost + totalLabCost
}

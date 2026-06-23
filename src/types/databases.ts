// ─── Material Database ────────────────────────────────────────────────────────

export interface MaterialDatabaseRow {
  id: string;
  parentSection: string;           // Walls | Ceiling
  rowNum: number | null;
  category: string;
  assemblyCode: string;
  code: string;
  wallLabourCode: string;
  ceilingLabourCode: string;
  bulkheadLabourCode: string;
  type: string;
  description: string;
  section: string;
  size: string;
  sizeNum: number;
  sizeMm: number | null;
  sizeImperial: string | null;
  unitPrice: number;
  containerUnit: string;
  qty1Formula: string;
  uom1: string;
  qty2Formula: string;
  uom2: string;
  qty1FormulaCeiling: string;
  uom1Ceiling: string;
  qty2FormulaCeiling: string;
  uom2Ceiling: string;
  notes: string;
  searchKeywords: string[];
}

// ─── Labour Database ──────────────────────────────────────────────────────────

export interface LabourDatabaseRow {
  id: string;
  parentSection: string;           // Walls | Ceiling | Bulkhead
  labourCode: string;              // e.g. LAB-FRM-STD
  code: string;                    // height band short code: STD | HI | VHI etc.
  description: string;
  category: string;
  htBand: string;                  // Standard | High | Very High | Extra High | Medium | All
  htMinFt: number;
  htMaxFt: number;
  uom: string;
  ratePerUom: number;
  qty1Formula: string;
  qty1Uom: string;
  notes: string;
}

// ─── Assembly Bunch Database ──────────────────────────────────────────────────

export interface AssemblyBunchItem {
  assemblyCode: string;
  itemCode: string;                // XXXXXXX = placeholder resolved at match time
  section: string;
  layers: number | null;
  description: string;
  size: string;
  labourCode: string;
  note: string;
  sortOrder: number;
}

export interface AssemblyBunchBranch {
  branchCode: string;              // e.g. FR-WALL
  group: string;                   // e.g. Framing
  items: AssemblyBunchItem[];
}

export interface AssemblyBunchDatabase {
  [group: string]: {
    [branchCode: string]: AssemblyBunchItem[];
  };
}

// ─── Paginated response shape ─────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

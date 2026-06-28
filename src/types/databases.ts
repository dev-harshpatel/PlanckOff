// ─── Shared sub-types ─────────────────────────────────────────────────────────

export interface SizeEntry {
  size: string;
  sizeNum: number;
  containerUnit: string;
  sizeMm: number | null;
  sizeImperial: string | null;
  unitPrice?: number;
}

export interface LabourBandEntry {
  labourCode: string;
  code: string;          // short code: STD | HI | VHI etc.
  htBand: string;        // Standard | High | Very High | Extra High | Medium | All
  htMinFt: number;
  htMaxFt: number;
  description: string;   // per-band description (e.g. "Install Metal Studs (Walls up to 12ft)")
  uom: string;
  ratePerUom: number;
  qty1Formula: string;   // per-band formula
  qty1Uom: string;
  notes: string;
  isActive?: boolean;    // false = hidden from material DB side; defaults to true when absent
}

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
  sizes: SizeEntry[];              // replaces: size, sizeNum, sizeMm, sizeImperial, containerUnit
  unitPrice: number;
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
  deletedAt: string | null;
}

// ─── Labour Database ──────────────────────────────────────────────────────────

export interface LabourDatabaseRow {
  id: string;
  parentCode: string;              // e.g. LAB-FRM — matches material wall/ceiling/bulkhead labour codes
  parentSection: string;           // Walls | Ceiling | Bulkhead
  description: string;             // parent bunch description
  category: string;
  labourBands: LabourBandEntry[];  // all child bands; each band carries its own description/formula/notes
  qty1Formula: string;             // deprecated — kept for backward compat; use band.qty1Formula
  qty1Uom: string;
  notes: string;
  deletedAt: string | null;
}

// ─── Assembly Bunch Database ──────────────────────────────────────────────────

export interface AssemblyBunchItem {
  id: string;
  assemblyCode: string;
  itemCode: string;                // XXXXXXX = placeholder resolved at match time
  section: string;
  layers: number | null;
  description: string;
  size: string;
  labourCode: string;
  note: string;
  sortOrder: number;
  deletedAt: string | null;
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

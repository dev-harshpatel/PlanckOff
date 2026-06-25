/**
 * Browser-compatible Excel parsers for the three reference databases.
 * These are adapted from the Node.js scripts in /scripts/ but use
 * XLSX.read(ArrayBuffer) instead of XLSX.readFile(path).
 */

import { read, utils } from 'xlsx';
import type { SizeEntry, LabourBandEntry } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MaterialImportRow {
  parent_section: string;
  row_num: number;
  category: string;
  assembly_code: string;
  code: string;
  wall_labour_code: string;
  ceiling_labour_code: string;
  bulkhead_labour_code: string;
  type: string;
  description: string;
  section: string;
  sizes_data: SizeEntry[];
  unit_price: number;
  qty1_formula: string;
  uom1: string;
  qty2_formula: string;
  uom2: string;
  qty1_formula_ceiling: string;
  uom1_ceiling: string;
  qty2_formula_ceiling: string;
  uom2_ceiling: string;
  notes: string;
  search_keywords: string[];
}

export interface LabourImportRow {
  parent_code: string;
  parent_section: string;
  description: string;
  category: string;
  labour_bands: LabourBandEntry[];
  qty1_formula: string;
  qty1_uom: string;
  notes: string;
}

export interface AssemblyBunchImportRow {
  parent_category: string;
  branch_code: string;
  assembly_code: string;
  item_code: string;
  section: string;
  layers: number | null;
  description: string;
  size: string;
  labour_code: string;
  note: string;
  sort_order: number;
}

export interface ParseResult<T> {
  rows: T[];
  sheetName: string;
  totalRawRows: number;
  skipped: number;
}

export type ImportType = 'materials' | 'labour' | 'assembly-bunches';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function str(row: unknown[], idx: number): string {
  if (idx < 0) return '';
  return String(row[idx] ?? '').trim();
}

function num(row: unknown[], idx: number): number {
  if (idx < 0) return 0;
  return parseFloat(String(row[idx])) || 0;
}

function intOrNull(row: unknown[], idx: number): number | null {
  if (idx < 0) return null;
  const val = String(row[idx] ?? '').trim();
  if (!val) return null;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
}

function findHeaderRow(
  allRows: unknown[][],
  maxSearch: number,
  keywords: string[],
): { idx: number; colMap: Record<string, number> } | null {
  for (let i = 0; i < Math.min(maxSearch, allRows.length); i++) {
    const row = allRows[i] as string[];
    const upper = row.map((c) => String(c).trim().toUpperCase().replace(/\s+/g, '_'));
    const hasAll = keywords.every((kw) => upper.some((cell) => cell.includes(kw)));
    if (hasAll) {
      const colMap: Record<string, number> = {};
      upper.forEach((col, idx) => {
        if (col) colMap[col] = idx;
      });
      return { idx: i, colMap };
    }
  }
  return null;
}

// ─── Materials helpers ────────────────────────────────────────────────────────

const MM_TO_IMPERIAL: Record<number, string> = {
  13: '1/2"',
  16: '5/8"',
  19: '3/4"',
  25: '1"',
  38: '1-1/2"',
  41: '1-5/8"',
  51: '2"',
  64: '2-1/2"',
  76: '3"',
  89: '3-1/2"',
  92: '3-5/8"',
  102: '4"',
  152: '6"',
  203: '8"',
};

const STOPWORDS = new Set([
  'of', 'the', 'and', 'at', 'for', 'with', 'to', 'in', 'a', 'an',
  'mm', 'x', 'or', 'by', 'per', 'from', 'on', 'is', 'n/a', '',
]);

export function computeKeywords(fields: (string | number | null | undefined)[]): string[] {
  const tokens = fields
    .flatMap((f) => String(f ?? '').toLowerCase().split(/[\s\-\/'"()+]+/))
    .map((t) => t.trim().replace(/[^a-z0-9.]/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

function parseSizeMM(sizeStr: string): number | null {
  const mmMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mmMatch) return parseFloat(mmMatch[1]);
  return null;
}

function parseSizeImperial(sizeStr: string, sizeMM: number | null): string | null {
  if (sizeMM !== null && MM_TO_IMPERIAL[sizeMM]) return MM_TO_IMPERIAL[sizeMM];
  if (sizeStr.includes('"') || sizeStr.includes("'")) {
    const match = sizeStr.match(/([\d\-/]+["'])/);
    return match ? match[1] : null;
  }
  return null;
}

// ─── Labour helpers ───────────────────────────────────────────────────────────

const SECTION_LABELS = new Set(['Walls', 'Bulkhead', 'Ceiling']);

function resolveParentSection(category: string): 'Walls' | 'Ceiling' | 'Bulkhead' {
  const upper = category.toUpperCase();
  if (upper.includes('CEILING') || upper === 'CEILINGS') return 'Ceiling';
  if (upper.includes('BULKHEAD')) return 'Bulkhead';
  return 'Walls';
}

const HT_BAND_NORMALISE: Record<string, string> = {
  STD: 'Standard',
  HI: 'High',
  VHI: 'Very High',
  XHI: 'Extra High',
  MED: 'Medium',
};

// ─── Assembly bunch helpers ───────────────────────────────────────────────────

const BRANCH_PARENT: Record<string, string> = {
  'FR-WALL': 'Framing',
  'FR-CLG': 'Framing',
  'FR-BULK': 'Framing',
  'FR-SHAFT': 'Framing',
  'FR-SHAFT-CLG': 'Framing',
  'DW-SGL-WALL': 'Drywall',
  'DW-DBL-WALL': 'Drywall',
  'DW-SGL-CLG': 'Drywall',
  'DW-DBL-CLG': 'Drywall',
  'DW-SGL-BULK': 'Drywall',
  'DW-SGL-SHAFT': 'Drywall',
  'DW-SGL-SHAFT-CLG': 'Drywall',
  'SH-WALL': 'Sheathing',
  'SH-CLG': 'Sheathing',
  'INS-WALL': 'Insulation',
  'INS-CLG': 'Insulation',
  'ACT-GRID-2X2': 'Ceiling Systems',
  'ACT-GRID-2X4': 'Ceiling Systems',
  'ACT-TILE': 'Ceiling Systems',
  'GYP-GRID': 'Ceiling Systems',
};

const KNOWN_BRANCH_CODES = [
  'DW-SGL-SHAFT-CLG', 'FR-SHAFT-CLG',
  'DW-SGL-SHAFT', 'FR-SHAFT',
  'ACT-GRID-2X2', 'ACT-GRID-2X4',
  'DW-SGL-WALL', 'DW-DBL-WALL', 'DW-SGL-BULK',
  'DW-SGL-CLG', 'DW-DBL-CLG',
  'FR-WALL', 'SH-WALL', 'INS-WALL',
  'FR-CLG', 'SH-CLG', 'INS-CLG',
  'FR-BULK', 'ACT-TILE', 'GYP-GRID',
];

function detectBranchCode(cells: string[]): string | null {
  const populated = cells.filter((c) => c.trim()).length;
  if (populated > 3) return null;
  const rowText = cells.join(' ').toUpperCase();
  for (const code of KNOWN_BRANCH_CODES) {
    if (rowText.includes(code)) return code;
  }
  return null;
}

function isAssemblyHeaderRow(cells: string[]): boolean {
  const upper = cells.map((c) => c.toUpperCase());
  return (
    upper.some((c) => c.includes('ASSEMBLY_CODE') || c === 'ASSEMBLY CODE') &&
    upper.some((c) => c.includes('CODE') || c.includes('ITEM'))
  );
}

function normaliseAssemblyColName(raw: string): string {
  const u = raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/[()]/g, '');
  if (u === 'CODE_ITEM' || u === 'CODE__ITEM' || u === 'ITEM_CODE' || u === 'CODE') return 'ITEM_CODE';
  if (u === 'ASSEMBLY_CODE') return 'ASSEMBLY_CODE';
  if (u.includes('LABOUR') && u.includes('CODE')) return 'LABOUR_CODE';
  if (u === 'NOTE' || u === 'NOTES') return 'NOTE';
  if (u === 'LAYERS' || u === 'LAYER') return 'LAYERS';
  if (u === 'DESCRIPTION') return 'DESCRIPTION';
  if (u === 'SECTION') return 'SECTION';
  if (u === 'SIZE') return 'SIZE';
  return u;
}

// ─── Public parsers ───────────────────────────────────────────────────────────

export function parseMaterialsExcel(arrayBuffer: ArrayBuffer): ParseResult<MaterialImportRow> {
  const wb = read(arrayBuffer, { type: 'array' });
  const sheetName =
    ['Material Data', 'Sheet1', 'Sheet 1', 'Materials'].find((n) => wb.Sheets[n]) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No sheet found. Available: ${wb.SheetNames.join(', ')}`);

  const allRows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find the two-row header (main header + sub-column header)
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i] as string[];
    const upper = row.map((c) => String(c).trim().toUpperCase());
    if (upper.includes('CODE') && upper.includes('DESCRIPTION')) {
      headerRowIdx = i;
      upper.forEach((col, idx) => { if (col) colMap[col] = idx; });
      break;
    }
  }

  if (headerRowIdx === -1) throw new Error('Could not find header row with CODE and DESCRIPTION.');

  const col = (name: string, ...fallbacks: string[]): number => {
    for (const k of [name, ...fallbacks]) {
      if (colMap[k] !== undefined) return colMap[k];
    }
    return -1;
  };

  // The Wall_FORMULA / Ceiling_FORMULA group labels in row 0 sit on a merged
  // cell whose text lands ONE COLUMN to the right of where the group's actual
  // sub-columns start in row 1 (a quirk of how XLSX reports merged-cell
  // labels). Anchoring on colMap['WALL_FORMULA'] is therefore off-by-one.
  // Instead, anchor directly on the sub-header row (row 1), which has a
  // unique, unambiguous label: CONTAINER_UNIT. Everything else in both the
  // wall and ceiling formula blocks is a fixed offset from that anchor:
  //   cuIdx+0 CONTAINER_UNIT        cuIdx+5 QTY1_FORMULA_CEILING
  //   cuIdx+1 QTY1_FORMULA          cuIdx+6 UOM1_CEILING
  //   cuIdx+2 UOM1                  cuIdx+7 QTY2_FORMULA_CEILING
  //   cuIdx+3 QTY2_FORMULA          cuIdx+8 UOM2_CEILING
  //   cuIdx+4 UOM2                  cuIdx+9 NOTES
  const subHeaderRow = (allRows[headerRowIdx + 1] as string[]) ?? [];
  const subUpper = subHeaderRow.map((c) => String(c).trim().toUpperCase().replace(/\s+/g, '_'));
  const cuIdx = subUpper.indexOf('CONTAINER_UNIT');

  const COL = {
    ROW_NUM: col('ROW_NUM'),
    CATEGORY: col('CATEGORY'),
    ASSEMBLY_CODE: col('ASSEMBLY_CODE'),
    CODE: col('CODE'),
    WALL_LABOUR_CODE: col('WALL_LABOUR_CODE'),
    CEILING_LABOUR_CODE: col('CEILING_LABOUR_CODE'),
    BULKHEAD_LABOUR_CODE: col('BULKHEAD_LABOUR_CODE', 'BULKHEAD_LABOUR_CODE2'),
    TYPE: col('TYPE'),
    DESCRIPTION: col('DESCRIPTION'),
    SECTION: col('SECTION'),
    SIZE: col('SIZE'),
    SIZE_NUM: col('SIZE_NUM'),
    UNIT_PRICE: col('UNIT_PRICE'),
    CONTAINER_UNIT: cuIdx >= 0 ? cuIdx : -1,
    QTY1_FORMULA: cuIdx >= 0 ? cuIdx + 1 : -1,
    UOM1: cuIdx >= 0 ? cuIdx + 2 : -1,
    QTY2_FORMULA: cuIdx >= 0 ? cuIdx + 3 : -1,
    UOM2: cuIdx >= 0 ? cuIdx + 4 : -1,
    QTY1_FORMULA_CEILING: cuIdx >= 0 ? cuIdx + 5 : -1,
    UOM1_CEILING: cuIdx >= 0 ? cuIdx + 6 : -1,
    QTY2_FORMULA_CEILING: cuIdx >= 0 ? cuIdx + 7 : -1,
    UOM2_CEILING: cuIdx >= 0 ? cuIdx + 8 : -1,
    NOTES: cuIdx >= 0 ? cuIdx + 9 : -1,
  };

  // Every Excel row is its own unique material row — sizes_data is always a
  // single-entry array on parse. Additional size entries are only ever added
  // later by a user via the "Add Size" button in the edit sidebar
  // (ItemFormSheet.tsx) — the importer must never merge rows by code.
  const rows: MaterialImportRow[] = [];
  let skipped = 0;

  // Start at +2: skip main header row + sub-column header row
  for (let i = headerRowIdx + 2; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const code = str(row, COL.CODE);
    if (!code) { skipped++; continue; }

    const sizeStr = str(row, COL.SIZE);
    const sizeMM = parseSizeMM(sizeStr);
    const sizeImperial = parseSizeImperial(sizeStr, sizeMM);
    const category = str(row, COL.CATEGORY);
    const type = str(row, COL.TYPE);
    const description = str(row, COL.DESCRIPTION);
    const wallLabourCode = str(row, COL.WALL_LABOUR_CODE);
    const ceilingLabourCode = str(row, COL.CEILING_LABOUR_CODE);
    const bulkheadLabourCode = str(row, COL.BULKHEAD_LABOUR_CODE);

    const sizeEntry: SizeEntry = {
      size: sizeStr,
      sizeNum: num(row, COL.SIZE_NUM),
      containerUnit: str(row, COL.CONTAINER_UNIT),
      sizeMm: sizeMM,
      sizeImperial,
    };

    rows.push({
      parent_section: category,
      row_num: num(row, COL.ROW_NUM),
      category,
      assembly_code: str(row, COL.ASSEMBLY_CODE),
      code,
      wall_labour_code: wallLabourCode,
      ceiling_labour_code: ceilingLabourCode,
      bulkhead_labour_code: bulkheadLabourCode,
      type,
      description,
      section: str(row, COL.SECTION),
      sizes_data: [sizeEntry],
      unit_price: num(row, COL.UNIT_PRICE),
      qty1_formula: str(row, COL.QTY1_FORMULA),
      uom1: str(row, COL.UOM1),
      qty2_formula: str(row, COL.QTY2_FORMULA),
      uom2: str(row, COL.UOM2),
      qty1_formula_ceiling: str(row, COL.QTY1_FORMULA_CEILING),
      uom1_ceiling: str(row, COL.UOM1_CEILING),
      qty2_formula_ceiling: str(row, COL.QTY2_FORMULA_CEILING),
      uom2_ceiling: str(row, COL.UOM2_CEILING),
      notes: str(row, COL.NOTES),
      search_keywords: computeKeywords([
        category, type, description, sizeImperial,
        sizeMM !== null ? `${sizeMM}mm` : null,
        wallLabourCode, ceilingLabourCode,
      ]),
    });
  }

  return { rows, sheetName, totalRawRows: allRows.length, skipped };
}

// Regex to match parent bunch header lines:
// "LAB-FRM   —   Install Framing Wall (Metal Studs)   (5 children)"
// "LAB-FRM-SH   —   Install CH/CT Studs (Shaftwall)   (no children)"
const PARENT_LINE_RE = /^([A-Z0-9\-]+)\s+[—\-]+\s+(.+?)\s+\((?:\d+|no)\s+children\)\s*$/;

function resolveParentSectionFromCode(
  excelSection: string,
  parentCode: string,
  parentDesc: string,
): 'Walls' | 'Ceiling' | 'Bulkhead' {
  if (excelSection === 'WALLS') return 'Walls';
  const pc = parentCode.toUpperCase();
  const pd = parentDesc.toUpperCase();
  if (
    pd.includes('CEILING') ||
    pc.includes('-CLG') ||
    pc.includes('-ACT') ||
    pc.includes('SHCLG') ||
    pc.includes('SHAFTCLNG') ||
    pc.includes('INSEXT') ||
    pc.includes('BAFFLE') ||
    pc.includes('REPAIR-CEILING') ||
    pc.includes('GRID-DW') ||
    pc === 'LAB-SH'
  ) return 'Ceiling';
  if (pd.includes('BULKHEAD') || pc.includes('BLKHD') || pc.includes('BULK')) return 'Bulkhead';
  return 'Ceiling';
}

export function parseLabourExcel(arrayBuffer: ArrayBuffer): ParseResult<LabourImportRow> {
  const wb = read(arrayBuffer, { type: 'array' });
  const sheetName =
    ['Labour Bunches', 'Labour Data', 'Sheet1', 'Sheet 1', 'Labour'].find((n) => wb.Sheets[n]) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No sheet found. Available: ${wb.SheetNames.join(', ')}`);

  const allRows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });

  // ── Indices for the per-child-row columns (fixed positions in this sheet) ──
  // Row format: [LABOUR CODE, CODE, HT BAND, HT MIN(ft), HT MAX(ft), DESCRIPTION, UOM, RATE/UOM, QTY1 FORMULA, QTY1 UOM, NOTES]
  const C = { LABOUR_CODE: 0, CODE: 1, HT_BAND: 2, HT_MIN: 3, HT_MAX: 4, DESC: 5, UOM: 6, RATE: 7, QTY1: 8, QTY1_UOM: 9, NOTES: 10 };

  const rows: LabourImportRow[] = [];
  let skipped = 0;
  let currentExcelSection = 'WALLS';
  let i = 0;

  while (i < allRows.length) {
    const row = allRows[i] as unknown[];
    const first = str(row, 0);

    // Detect section headers (WALLS / CEILINGS / BULKHEAD)
    if (first === 'WALLS' || first === 'CEILINGS' || first === 'BULKHEAD') {
      currentExcelSection = first;
      i++;
      continue;
    }

    // Detect parent bunch header line
    const parentMatch = first.match(PARENT_LINE_RE);
    if (parentMatch) {
      const parentCode = parentMatch[1].trim();
      const parentDesc = parentMatch[2].trim();
      const parentSection = resolveParentSectionFromCode(
        currentExcelSection,
        parentCode,
        parentDesc,
      );

      i++; // skip parent header
      // skip column-header row (LABOUR CODE, CODE, HT BAND, ...)
      if (i < allRows.length) {
        const headerCandidate = str(allRows[i] as unknown[], 0);
        if (headerCandidate === 'LABOUR CODE') i++;
      }

      // Collect all child band rows until empty row or next parent
      const bands: LabourBandEntry[] = [];
      while (i < allRows.length) {
        const childRow = allRows[i] as unknown[];
        const labourCode = str(childRow, C.LABOUR_CODE);

        // Empty row, section label, or next parent header → end of this bunch
        if (!labourCode) { i++; break; }
        if (SECTION_LABELS.has(labourCode)) break;
        if (PARENT_LINE_RE.test(labourCode)) break;
        if (labourCode === 'LABOUR CODE') { i++; continue; }

        const rawBand = str(childRow, C.HT_BAND) || 'All';
        bands.push({
          labourCode,
          code: str(childRow, C.CODE),
          htBand: HT_BAND_NORMALISE[rawBand] ?? rawBand,
          htMinFt: num(childRow, C.HT_MIN),
          htMaxFt: num(childRow, C.HT_MAX) || 99,
          description: str(childRow, C.DESC),
          uom: str(childRow, C.UOM),
          ratePerUom: num(childRow, C.RATE),
          qty1Formula: str(childRow, C.QTY1),
          qty1Uom: str(childRow, C.QTY1_UOM),
          notes: str(childRow, C.NOTES),
        });
        i++;
      }

      if (bands.length === 0) { skipped++; continue; }

      rows.push({
        parent_code: parentCode,
        parent_section: parentSection,
        description: parentDesc,
        category: parentSection,
        labour_bands: bands,
        // row-level formula/uom/notes: use first band's values as representative
        qty1_formula: bands[0].qty1Formula,
        qty1_uom: bands[0].qty1Uom,
        notes: '',
      });
      continue;
    }

    skipped++;
    i++;
  }

  return { rows, sheetName, totalRawRows: allRows.length, skipped };
}

export function parseAssemblyBunchesExcel(arrayBuffer: ArrayBuffer): ParseResult<AssemblyBunchImportRow> {
  const wb = read(arrayBuffer, { type: 'array' });
  const sheetName =
    ['by default assembly branch', 'Sheet1', 'Sheet 1'].find((n) => wb.Sheets[n]) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`No sheet found. Available: ${wb.SheetNames.join(', ')}`);

  const allRows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });

  const rows: AssemblyBunchImportRow[] = [];
  let skipped = 0;
  let currentBranchCode: string | null = null;
  let currentColMap: Record<string, number> = {};
  let sortOrder = 0;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const cells = row.map((c) => String(c ?? '').trim());

    if (cells.every((c) => !c)) { skipped++; continue; }

    const detected = detectBranchCode(cells);
    if (detected) {
      currentBranchCode = detected;
      currentColMap = {};
      sortOrder = 0;
      continue;
    }

    if (isAssemblyHeaderRow(cells)) {
      currentColMap = {};
      cells.forEach((cell, idx) => {
        const key = normaliseAssemblyColName(cell);
        if (key) currentColMap[key] = idx;
      });
      continue;
    }

    if (!currentBranchCode || Object.keys(currentColMap).length === 0) continue;

    const itemCode = str(row, currentColMap['ITEM_CODE'] ?? -1);
    if (!itemCode) { skipped++; continue; }

    rows.push({
      parent_category: BRANCH_PARENT[currentBranchCode] ?? 'Other',
      branch_code: currentBranchCode,
      assembly_code: str(row, currentColMap['ASSEMBLY_CODE'] ?? -1),
      item_code: itemCode,
      section: str(row, currentColMap['SECTION'] ?? -1),
      layers: intOrNull(row, currentColMap['LAYERS'] ?? -1),
      description: str(row, currentColMap['DESCRIPTION'] ?? -1),
      size: str(row, currentColMap['SIZE'] ?? -1),
      labour_code: str(row, currentColMap['LABOUR_CODE'] ?? -1),
      note: str(row, currentColMap['NOTE'] ?? -1),
      sort_order: sortOrder++,
    });
  }

  return { rows, sheetName, totalRawRows: allRows.length, skipped };
}

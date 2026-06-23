/**
 * parseMaterialDatabase.ts
 * Reads data/Drywall Database (6-17-2026).xlsx → data/json/material_database.json
 *
 * Run: npx tsx scripts/parseMaterialDatabase.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'Drywall Database (6-18-2026).xlsx');
const OUTPUT_FILE = path.resolve('data', 'json', 'material_database.json');
// Try these sheet names in order — use whichever exists
const SHEET_NAME_CANDIDATES = ['Material Data', 'Sheet1', 'Sheet 1', 'Materials'];

// ─── Parent section mapping ───────────────────────────────────────────────────
// parent_section mirrors the category value directly from the sheet.
// No computed Walls/Ceiling mapping — the category IS the parent grouping.

// ─── mm → imperial lookup ─────────────────────────────────────────────────────

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

// ─── Keyword helpers ──────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'of', 'the', 'and', 'at', 'for', 'with', 'to', 'in', 'a', 'an',
  'mm', 'x', 'or', 'by', 'per', 'from', 'on', 'is', 'n/a', '',
]);

function computeKeywords(fields: (string | number | null | undefined)[]): string[] {
  const tokens = fields
    .flatMap(f => String(f ?? '').toLowerCase().split(/[\s\-\/'"()+]+/))
    .map(t => t.trim().replace(/[^a-z0-9.]/g, ''))
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

// ─── Size parsing ─────────────────────────────────────────────────────────────

function parseSizeMM(sizeStr: string): number | null {
  const mmMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mmMatch) return parseFloat(mmMatch[1]);
  return null;
}

function parseSizeImperial(sizeStr: string, sizeMM: number | null): string | null {
  if (sizeMM !== null && MM_TO_IMPERIAL[sizeMM]) return MM_TO_IMPERIAL[sizeMM];
  // Already imperial e.g. '5/8"', '3-5/8"', '1-1/2"'
  if (sizeStr.includes('"') || sizeStr.includes("'")) {
    const match = sizeStr.match(/([\d\-/]+["'])/);
    return match ? match[1] : null;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(INPUT_FILE);
  const sheetName = SHEET_NAME_CANDIDATES.find(n => wb.Sheets[n]) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`ERROR: No sheet found. Available: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  console.log(`Using sheet: "${sheetName}"`);

  const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`Total rows in sheet: ${allRows.length}`);

  // ── Find header row (contains CODE and DESCRIPTION) ──────────────────────
  // The Excel now has a TWO-ROW header:
  //   Row 0: main column names + group names (Wall_FORMULA, Ceiling_FORMULA)
  //   Row 1: sub-column names under each group (CONTAINER_UNIT, QTY1_FORMULA, ...)
  // Data rows start at headerRowIdx + 2.

  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i] as string[];
    const upper = row.map(c => String(c).trim().toUpperCase());
    if (upper.includes('CODE') && upper.includes('DESCRIPTION')) {
      headerRowIdx = i;
      upper.forEach((col, idx) => { colMap[col] = idx; });
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.error('ERROR: Could not find header row with CODE and DESCRIPTION.');
    process.exit(1);
  }
  console.log(`Header row found at index: ${headerRowIdx}`);
  console.log(`Columns detected: ${Object.keys(colMap).filter(k => k).join(', ')}`);

  // Column index helper for named columns in row 0
  const col = (name: string, ...fallbacks: string[]): number => {
    for (const k of [name, ...fallbacks]) {
      if (colMap[k] !== undefined) return colMap[k];
    }
    return -1;
  };

  // Locate the two formula group headers in row 0 (case-insensitive match)
  // Wall_FORMULA spans: wfBase+0=CONTAINER_UNIT, +1=QTY1, +2=UOM1, +3=QTY2, +4=UOM2
  // Ceiling_FORMULA spans: cfBase+1=QTY1, +2=UOM1, +3=QTY2, +4=UOM2, +5=NOTES
  const wfBase = colMap['WALL_FORMULA'] ?? -1;
  const cfBase = colMap['CEILING_FORMULA'] ?? -1;

  if (wfBase === -1 || cfBase === -1) {
    console.warn('WARNING: Could not find Wall_FORMULA / Ceiling_FORMULA group headers — formula columns will be empty.');
  }

  const COL = {
    ROW_NUM:              col('ROW_NUM'),
    CATEGORY:             col('CATEGORY'),
    ASSEMBLY_CODE:        col('ASSEMBLY_CODE'),
    CODE:                 col('CODE'),
    WALL_LABOUR_CODE:     col('WALL_LABOUR_CODE'),
    CEILING_LABOUR_CODE:  col('CEILING_LABOUR_CODE'),
    BULKHEAD_LABOUR_CODE: col('BULKHEAD_LABOUR_CODE', 'BULKHEAD_LABOUR_CODE2'),
    TYPE:                 col('TYPE'),
    DESCRIPTION:          col('DESCRIPTION'),
    SECTION:              col('SECTION'),
    SIZE:                 col('SIZE'),
    SIZE_NUM:             col('SIZE_NUM'),
    UNIT_PRICE:           col('UNIT_PRICE'),
    // Wall formula sub-columns (relative to wfBase)
    CONTAINER_UNIT:       wfBase >= 0 ? wfBase     : -1,
    QTY1_FORMULA:         wfBase >= 0 ? wfBase + 1 : -1,
    UOM1:                 wfBase >= 0 ? wfBase + 2 : -1,
    QTY2_FORMULA:         wfBase >= 0 ? wfBase + 3 : -1,
    UOM2:                 wfBase >= 0 ? wfBase + 4 : -1,
    // Ceiling formula sub-columns (relative to cfBase)
    QTY1_FORMULA_CEILING: cfBase >= 0 ? cfBase + 1 : -1,
    UOM1_CEILING:         cfBase >= 0 ? cfBase + 2 : -1,
    QTY2_FORMULA_CEILING: cfBase >= 0 ? cfBase + 3 : -1,
    UOM2_CEILING:         cfBase >= 0 ? cfBase + 4 : -1,
    NOTES:                cfBase >= 0 ? cfBase + 5 : -1,
  };

  const str  = (row: unknown[], idx: number) => idx >= 0 ? String(row[idx] ?? '').trim() : '';
  const num  = (row: unknown[], idx: number) => idx >= 0 ? (parseFloat(String(row[idx])) || 0) : 0;

  // ── Parse data rows ───────────────────────────────────────────────────────
  const records = [];
  let skippedSectionHeaders = 0;
  let skippedEmptyCode = 0;

  // Start at +2 to skip both the main header row and the sub-column header row
  for (let i = headerRowIdx + 2; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const code = str(row, COL.CODE);

    // Skip empty code rows (section headers, blank rows)
    if (!code) {
      const category = str(row, COL.CATEGORY);
      if (category) skippedSectionHeaders++;
      else skippedEmptyCode++;
      continue;
    }

    const sizeStr = str(row, COL.SIZE);
    const sizeMM = parseSizeMM(sizeStr);
    const sizeImperial = parseSizeImperial(sizeStr, sizeMM);

    const category             = str(row, COL.CATEGORY);
    const type                 = str(row, COL.TYPE);
    const description          = str(row, COL.DESCRIPTION);
    const wallLabourCode       = str(row, COL.WALL_LABOUR_CODE);
    const ceilingLabourCode    = str(row, COL.CEILING_LABOUR_CODE);
    const bulkheadLabourCode   = str(row, COL.BULKHEAD_LABOUR_CODE);

    const searchKeywords = computeKeywords([
      category, type, description,
      sizeImperial, sizeMM !== null ? String(sizeMM) + 'mm' : null,
      wallLabourCode, ceilingLabourCode,
    ]);

    records.push({
      parent_section:         category,
      row_num:                num(row, COL.ROW_NUM),
      category,
      assembly_code:          str(row, COL.ASSEMBLY_CODE),
      code,
      wall_labour_code:       wallLabourCode,
      ceiling_labour_code:    ceilingLabourCode,
      bulkhead_labour_code:   bulkheadLabourCode,
      type,
      description,
      section:                str(row, COL.SECTION),
      size:                   sizeStr,
      size_num:               num(row, COL.SIZE_NUM),
      unit_price:             num(row, COL.UNIT_PRICE),
      container_unit:         str(row, COL.CONTAINER_UNIT),
      qty1_formula:           str(row, COL.QTY1_FORMULA),
      uom1:                   str(row, COL.UOM1),
      qty2_formula:           str(row, COL.QTY2_FORMULA),
      uom2:                   str(row, COL.UOM2),
      qty1_formula_ceiling:   str(row, COL.QTY1_FORMULA_CEILING),
      uom1_ceiling:           str(row, COL.UOM1_CEILING),
      qty2_formula_ceiling:   str(row, COL.QTY2_FORMULA_CEILING),
      uom2_ceiling:           str(row, COL.UOM2_CEILING),
      notes:                  str(row, COL.NOTES),
      search_keywords:        searchKeywords,
      size_mm:                sizeMM,
      size_imperial:          sizeImperial,
    });
  }

  // ── Write JSON ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(records, null, 2), 'utf-8');

  console.log('\n── Material Database Parse Results ──────────────────');
  console.log(`  Data rows written        : ${records.length}`);
  console.log(`  Section headers skipped  : ${skippedSectionHeaders}`);
  console.log(`  Blank rows skipped       : ${skippedEmptyCode}`);
  console.log(`  Output → ${OUTPUT_FILE}`);

  // Per-section breakdown
  const bySection: Record<string, number> = {};
  for (const r of records) { bySection[r.parent_section] = (bySection[r.parent_section] ?? 0) + 1; }
  console.log('\n  Rows per section:');
  for (const [s, c] of Object.entries(bySection)) console.log(`    ${s.padEnd(10)} ${c}`);

  // Category breakdown
  const byCategory: Record<string, number> = {};
  for (const r of records) { byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
  console.log('\n  Rows per category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(20)} ${count}`);
  }
}

run();

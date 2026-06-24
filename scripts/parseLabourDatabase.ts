/**
 * parseLabourDatabase.ts
 * Reads data/Labour Database (6-17-2026).xlsx → data/json/labour_database.json
 *
 * Run: npx tsx scripts/parseLabourDatabase.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'Labour Database (6-18-2026).xlsx');
const OUTPUT_FILE = path.resolve('data', 'json', 'labour_database.json');
const SHEET_NAME_CANDIDATES = ['Labour Data', 'Sheet1', 'Sheet 1', 'Labour'];

// ─── Section label rows to skip ───────────────────────────────────────────────
// These are the section header rows in the Excel (LABOUR_CODE = "Walls" etc.)
const SECTION_LABELS = new Set(['Walls', 'Bulkhead', 'Ceiling']);

// ─── Parent section mapping ───────────────────────────────────────────────────
// Category → parent section. Ceiling and Bulkhead are explicit; everything
// else falls under Walls.
function resolveParent(category: string): 'Walls' | 'Ceiling' | 'Bulkhead' {
  const upper = category.toUpperCase();
  if (upper.includes('CEILING') || upper === 'CEILINGS') return 'Ceiling';
  if (upper.includes('BULKHEAD')) return 'Bulkhead';
  return 'Walls';
}

// Normalise HT_BAND abbreviations → full names
const HT_BAND_NORMALISE: Record<string, string> = {
  'STD': 'Standard',
  'HI':  'High',
  'VHI': 'Very High',
  'XHI': 'Extra High',
  'MED': 'Medium',
};

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

  // ── Find header row (contains LABOUR_CODE) ────────────────────────────────
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    const row = allRows[i] as string[];
    const upper = row.map(c => String(c).trim().toUpperCase().replace(/\s+/g, '_'));
    if (upper.includes('LABOUR_CODE')) {
      headerRowIdx = i;
      upper.forEach((col, idx) => { if (col) colMap[col] = idx; });
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.error('ERROR: Could not find header row with LABOUR_CODE.');
    process.exit(1);
  }
  console.log(`Header row found at index: ${headerRowIdx}`);
  console.log(`Columns detected: ${Object.keys(colMap).join(', ')}`);

  const str = (row: unknown[], idx: number) => idx >= 0 ? String(row[idx] ?? '').trim() : '';
  const num = (row: unknown[], idx: number) => idx >= 0 ? (parseFloat(String(row[idx])) || 0) : 0;

  const COL = {
    LABOUR_CODE:   colMap['LABOUR_CODE']   ?? -1,
    CODE:          colMap['CODE']           ?? -1,
    DESCRIPTION:   colMap['DESCRIPTION']   ?? -1,
    CATEGORY:      colMap['CATEGORY']      ?? -1,
    HT_BAND:       colMap['HT_BAND']       ?? -1,
    HT_MIN_FT:     colMap['HT_MIN_FT']     ?? -1,
    HT_MAX_FT:     colMap['HT_MAX_FT']     ?? -1,
    UOM:           colMap['UOM']           ?? -1,
    RATE_PER_UOM:  colMap['RATE_PER_UOM']  ?? -1,
    QTY1_FORMULA:  colMap['QTY1_FORMULA']  ?? -1,
    QTY1_UOM:      colMap['QTY1_UOM']      ?? -1,
    NOTES:         colMap['NOTES']         ?? -1,
  };

  // ── Parse data rows ───────────────────────────────────────────────────────
  // Every Excel row is its own unique labour_database row — labour_bands is
  // always a single-entry array on parse. Additional band entries are only
  // ever added later by a user via the "Add Band" button in the edit sidebar
  // (ItemFormSheet.tsx) — the importer must never merge rows by category/description.
  interface LabourBandEntry {
    labourCode: string;
    code: string;
    htBand: string;
    htMinFt: number;
    htMaxFt: number;
    uom: string;
    ratePerUom: number;
  }

  const records = [];
  let skippedSectionLabels = 0;
  let skippedBlank = 0;

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const labourCode = str(row, COL.LABOUR_CODE);

    if (!labourCode) {
      const anyContent = (row as unknown[]).some(c => String(c).trim().length > 0);
      if (anyContent) skippedSectionLabels++;
      else skippedBlank++;
      continue;
    }

    // Skip section label rows (labour_code is the section name itself, no description)
    if (SECTION_LABELS.has(labourCode)) {
      skippedSectionLabels++;
      continue;
    }

    const category = str(row, COL.CATEGORY);
    const description = str(row, COL.DESCRIPTION);
    const rawBand = str(row, COL.HT_BAND) || 'All';
    const htBand = HT_BAND_NORMALISE[rawBand] ?? rawBand;

    const band: LabourBandEntry = {
      labourCode,
      code:       str(row, COL.CODE),
      htBand,
      htMinFt:    num(row, COL.HT_MIN_FT),
      htMaxFt:    num(row, COL.HT_MAX_FT) || 99,
      uom:        str(row, COL.UOM),
      ratePerUom: num(row, COL.RATE_PER_UOM),
    };

    records.push({
      parent_section: resolveParent(category),
      description,
      category,
      labour_bands:  [band],
      qty1_formula:  str(row, COL.QTY1_FORMULA),
      qty1_uom:      str(row, COL.QTY1_UOM),
      notes:         str(row, COL.NOTES),
    });
  }

  // ── Write JSON ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(records, null, 2), 'utf-8');

  console.log('\n── Labour Database Parse Results ────────────────────');
  console.log(`  Data rows written        : ${records.length}`);
  console.log(`  Section labels skipped   : ${skippedSectionLabels}`);
  console.log(`  Blank rows skipped       : ${skippedBlank}`);
  console.log(`  Output → ${OUTPUT_FILE}`);

  // Per-section breakdown
  const bySection: Record<string, number> = {};
  for (const r of records) { bySection[r.parent_section] = (bySection[r.parent_section] ?? 0) + 1; }
  console.log('\n  Rows per section:');
  for (const [s, c] of Object.entries(bySection)) console.log(`    ${s.padEnd(12)} ${c}`);

  // Category breakdown
  const byCategory: Record<string, number> = {};
  for (const r of records) { byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
  console.log('\n  Rows per category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(35)} ${count}`);
  }

  // Height band breakdown (across all bands, not just grouped records)
  const byBand: Record<string, number> = {};
  for (const r of records) {
    for (const band of r.labour_bands) {
      byBand[band.htBand] = (byBand[band.htBand] ?? 0) + 1;
    }
  }
  console.log('\n  Rows per height band:');
  for (const [band, count] of Object.entries(byBand).sort()) {
    console.log(`    ${band.padEnd(15)} ${count}`);
  }
}

run();

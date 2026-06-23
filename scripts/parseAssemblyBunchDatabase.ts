/**
 * parseAssemblyBunchDatabase.ts
 * Reads data/Default_Assembly_Branch (6-17-2026).xlsx → data/json/assembly_bunch_database.json
 *
 * The Excel has 20 named sections. Each section has:
 *   Row 1: section label (contains the branch code e.g. "FR-WALL")
 *   Row 2: column headers (ASSEMBLY_CODE, CODE, SECTION, Layers, DESCRIPTION, SIZE, LABOUR CODE, NOTE)
 *   Row 3+: data rows
 *
 * Run: npx tsx scripts/parseAssemblyBunchDatabase.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'Default_Assembly_Branch (6-18-2026).xlsx');
const OUTPUT_FILE = path.resolve('data', 'json', 'assembly_bunch_database.json');
const SHEET_NAME_CANDIDATES = ['by default assembly branch', 'Sheet1', 'Sheet 1'];

// ─── Parent category mapping ──────────────────────────────────────────────────

const BRANCH_PARENT: Record<string, string> = {
  'FR-WALL':          'Framing',
  'FR-CLG':           'Framing',
  'FR-BULK':          'Framing',
  'FR-SHAFT':         'Framing',
  'FR-SHAFT-CLG':     'Framing',
  'DW-SGL-WALL':      'Drywall',
  'DW-DBL-WALL':      'Drywall',
  'DW-SGL-CLG':       'Drywall',
  'DW-DBL-CLG':       'Drywall',
  'DW-SGL-BULK':      'Drywall',
  'DW-SGL-SHAFT':     'Drywall',
  'DW-SGL-SHAFT-CLG': 'Drywall',
  'SH-WALL':          'Sheathing',
  'SH-CLG':           'Sheathing',
  'INS-WALL':         'Insulation',
  'INS-CLG':          'Insulation',
  'ACT-GRID-2X2':     'Ceiling Systems',
  'ACT-GRID-2X4':     'Ceiling Systems',
  'ACT-TILE':         'Ceiling Systems',
  'GYP-GRID':         'Ceiling Systems',
};

// ─── Known branch codes ───────────────────────────────────────────────────────
// Sorted longest-first so more specific codes (FR-SHAFT-CLG) match before
// their substrings (FR-SHAFT). Do NOT change this order.

const KNOWN_BRANCH_CODES = [
  'DW-SGL-SHAFT-CLG', 'FR-SHAFT-CLG',
  'DW-SGL-SHAFT', 'FR-SHAFT',
  'ACT-GRID-2X2', 'ACT-GRID-2X4',
  'DW-SGL-WALL', 'DW-DBL-WALL', 'DW-SGL-BULK',
  'DW-SGL-CLG',  'DW-DBL-CLG',
  'FR-WALL', 'SH-WALL', 'INS-WALL',
  'FR-CLG',  'SH-CLG',  'INS-CLG',
  'FR-BULK', 'ACT-TILE', 'GYP-GRID',
];

// Section label rows have very few populated cells (1–2 max).
// Data rows always have several populated cells.
// This guards against a branch code appearing inside a NOTE or DESCRIPTION cell.
function detectBranchCode(rowCells: string[]): string | null {
  const populated = rowCells.filter(c => c.trim()).length;
  if (populated > 3) return null; // looks like a data row, not a label
  const rowText = rowCells.join(' ').toUpperCase();
  for (const code of KNOWN_BRANCH_CODES) {
    if (rowText.includes(code)) return code;
  }
  return null;
}

function isHeaderRow(rowCells: string[]): boolean {
  const upper = rowCells.map(c => c.toUpperCase());
  return (
    upper.some(c => c.includes('ASSEMBLY_CODE') || c === 'ASSEMBLY CODE') &&
    upper.some(c => c.includes('CODE') || c.includes('ITEM'))
  );
}

function isBlankRow(rowCells: string[]): boolean {
  return rowCells.every(c => !c.trim());
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

  const records: object[] = [];
  const sectionsSeen: string[] = [];

  let currentBranchCode: string | null = null;
  let currentColMap: Record<string, number> = {};
  let sortOrder = 0;
  let skippedBlank = 0;
  let skippedHeader = 0;

  const str = (row: unknown[], idx: number) =>
    idx >= 0 ? String(row[idx] ?? '').trim() : '';

  const int = (row: unknown[], idx: number): number | null => {
    if (idx < 0) return null;
    const val = String(row[idx] ?? '').trim();
    if (!val) return null;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
  };

  // ── Column name normaliser ────────────────────────────────────────────────
  // Maps raw header text → canonical key used in currentColMap
  function normaliseColName(raw: string): string {
    const u = raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/[()]/g, '');
    // Handle variations
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

  // ── Scan all rows ─────────────────────────────────────────────────────────
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[];
    const cells = row.map(c => String(c ?? '').trim());

    if (isBlankRow(cells)) {
      skippedBlank++;
      continue;
    }

    // Check for section label row
    const detected = detectBranchCode(cells);
    if (detected) {
      currentBranchCode = detected;
      currentColMap = {};
      sortOrder = 0;
      if (!sectionsSeen.includes(detected)) sectionsSeen.push(detected);
      console.log(`  Detected section: ${detected} (row ${i})`);
      continue;
    }

    // Check for header row within current section
    if (isHeaderRow(cells)) {
      currentColMap = {};
      cells.forEach((cell, idx) => {
        const key = normaliseColName(cell);
        if (key) currentColMap[key] = idx;
      });
      skippedHeader++;
      continue;
    }

    // Skip data rows before any section is detected
    if (!currentBranchCode) continue;

    // Skip data rows before a header is detected in this section
    if (Object.keys(currentColMap).length === 0) continue;

    // Parse data row
    const itemCode = str(row, currentColMap['ITEM_CODE'] ?? -1);

    // Skip rows with no item code (section sub-headers, notes, etc.)
    if (!itemCode) {
      skippedBlank++;
      continue;
    }

    records.push({
      parent_category: BRANCH_PARENT[currentBranchCode] ?? 'Other',
      branch_code:     currentBranchCode,
      assembly_code:   str(row, currentColMap['ASSEMBLY_CODE'] ?? -1),
      item_code:       itemCode,
      section:         str(row, currentColMap['SECTION']       ?? -1),
      layers:          int(row, currentColMap['LAYERS']        ?? -1),
      description:     str(row, currentColMap['DESCRIPTION']   ?? -1),
      size:            str(row, currentColMap['SIZE']          ?? -1),
      labour_code:     str(row, currentColMap['LABOUR_CODE']   ?? -1),
      note:            str(row, currentColMap['NOTE']          ?? -1),
      sort_order:      sortOrder++,
    });
  }

  // ── Build grouped output ───────────────────────────────────────────────────
  // Structure: { "Framing": { "FR-WALL": [...items], ... }, "Drywall": { ... }, ... }
  // Items inside each branch array drop parent_category and branch_code (already encoded as keys)

  const PARENT_ORDER = ['Framing', 'Drywall', 'Sheathing', 'Insulation', 'Ceiling Systems'];

  type ItemRow = {
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
  };

  const grouped: Record<string, Record<string, object[]>> = {};

  for (const parent of PARENT_ORDER) {
    grouped[parent] = {};
    const branches = KNOWN_BRANCH_CODES.filter(c => BRANCH_PARENT[c] === parent);
    for (const branch of branches) {
      const items = (records as ItemRow[])
        .filter(r => r.branch_code === branch)
        .map(({ parent_category: _p, branch_code: _b, ...rest }) => rest);
      grouped[parent][branch] = items;
    }
  }

  // ── Write JSON ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(grouped, null, 2), 'utf-8');

  console.log('\n── Assembly Bunch Database Parse Results ────────────');
  console.log(`  Data rows written    : ${records.length}`);
  console.log(`  Sections detected   : ${sectionsSeen.length} / ${KNOWN_BRANCH_CODES.length}`);
  console.log(`  Header rows skipped : ${skippedHeader}`);
  console.log(`  Blank rows skipped  : ${skippedBlank}`);
  console.log(`  Output → ${OUTPUT_FILE}`);

  // Per-section breakdown
  const byBranch: Record<string, number> = {};
  for (const r of records as Array<{ branch_code: string }>) {
    byBranch[r.branch_code] = (byBranch[r.branch_code] ?? 0) + 1;
  }
  console.log('\n  Rows per branch:');
  for (const code of KNOWN_BRANCH_CODES) {
    const count = byBranch[code] ?? 0;
    const flag = count === 0 ? '  ← MISSING!' : '';
    console.log(`    ${code.padEnd(22)} ${count}${flag}`);
  }

  // XXXXXXX placeholder count
  const placeholders = (records as Array<{ item_code: string }>)
    .filter(r => r.item_code.includes('X')).length;
  console.log(`\n  Placeholder (XXXXXXX) rows: ${placeholders}`);

  // Warn about any missing known sections
  const missing = KNOWN_BRANCH_CODES.filter(c => !sectionsSeen.includes(c));
  if (missing.length > 0) {
    console.warn(`\n  ⚠ WARNING: These sections were not found in the Excel:`);
    missing.forEach(c => console.warn(`    - ${c}`));
  }
}

run();

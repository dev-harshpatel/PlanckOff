/**
 * Seed script: re-imports material_database from the new Drywall Database Excel.
 * This updates wall/ceiling/bulkhead labour codes from old child codes (LAB-HNG-STD)
 * to new parent codes (LAB-HNG).
 *
 * Run: node scripts/seedMaterialDatabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(row, idx) { return String(row[idx] ?? '').trim(); }
function num(row, idx) { return parseFloat(String(row[idx])) || 0; }

const MM_TO_IMPERIAL = {
  13: '1/2"', 16: '5/8"', 19: '3/4"', 25: '1"',
  38: '1-1/2"', 41: '1-5/8"', 51: '2"', 64: '2-1/2"',
  76: '3"', 89: '3-1/2"', 92: '3-5/8"', 102: '4"', 152: '6"', 203: '8"',
};

const STOPWORDS = new Set(['of','the','and','at','for','with','to','in','a','an','mm','x','or','by','per','from','on','is','n/a','']);

function computeKeywords(fields) {
  const tokens = fields
    .flatMap(f => String(f ?? '').toLowerCase().split(/[\s\-\/'"()+]+/))
    .map(t => t.trim().replace(/[^a-z0-9.]/g, ''))
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

function parseSizeMM(sizeStr) {
  const m = sizeStr.match(/(\d+(?:\.\d+)?)\s*mm/i);
  return m ? parseFloat(m[1]) : null;
}

function parseSizeImperial(sizeStr, sizeMM) {
  if (sizeMM !== null && MM_TO_IMPERIAL[sizeMM]) return MM_TO_IMPERIAL[sizeMM];
  if (sizeStr.includes('"') || sizeStr.includes("'")) {
    const m = sizeStr.match(/([\d\-/]+["'])/);
    return m ? m[1] : null;
  }
  return null;
}

// ─── Parse Excel ──────────────────────────────────────────────────────────────

function parseMaterialsExcel(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheetName = ['Material Data','Sheet1','Sheet 1','Materials'].find(n => wb.Sheets[n]) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const allRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row containing CODE and DESCRIPTION
  let headerRowIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i];
    const upper = row.map(c => String(c).trim().toUpperCase());
    if (upper.includes('CODE') && upper.includes('DESCRIPTION')) {
      headerRowIdx = i;
      upper.forEach((col, idx) => { if (col) colMap[col] = idx; });
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error('Could not find header row with CODE and DESCRIPTION.');

  // Sub-header row anchored on CONTAINER_UNIT
  const subHeaderRow = allRows[headerRowIdx + 1] ?? [];
  const subUpper = subHeaderRow.map(c => String(c).trim().toUpperCase().replace(/\s+/g, '_'));
  const cuIdx = subUpper.indexOf('CONTAINER_UNIT');

  const COL = {
    ROW_NUM:               colMap['ROW_NUM'] ?? -1,
    CATEGORY:              colMap['CATEGORY'] ?? -1,
    ASSEMBLY_CODE:         colMap['ASSEMBLY_CODE'] ?? -1,
    CODE:                  colMap['CODE'] ?? -1,
    WALL_LABOUR_CODE:      colMap['WALL_LABOUR_CODE'] ?? -1,
    CEILING_LABOUR_CODE:   colMap['CEILING_LABOUR_CODE'] ?? -1,
    BULKHEAD_LABOUR_CODE:  colMap['BULKHEAD_LABOUR_CODE'] ?? -1,
    TYPE:                  colMap['TYPE'] ?? -1,
    DESCRIPTION:           colMap['DESCRIPTION'] ?? -1,
    SECTION:               colMap['SECTION'] ?? -1,
    SIZE:                  colMap['SIZE'] ?? -1,
    SIZE_NUM:              colMap['SIZE_NUM'] ?? -1,
    UNIT_PRICE:            colMap['UNIT_PRICE'] ?? -1,
    CONTAINER_UNIT:        cuIdx >= 0 ? cuIdx     : -1,
    QTY1_FORMULA:          cuIdx >= 0 ? cuIdx + 1 : -1,
    UOM1:                  cuIdx >= 0 ? cuIdx + 2 : -1,
    QTY2_FORMULA:          cuIdx >= 0 ? cuIdx + 3 : -1,
    UOM2:                  cuIdx >= 0 ? cuIdx + 4 : -1,
    QTY1_FORMULA_CEILING:  cuIdx >= 0 ? cuIdx + 5 : -1,
    UOM1_CEILING:          cuIdx >= 0 ? cuIdx + 6 : -1,
    QTY2_FORMULA_CEILING:  cuIdx >= 0 ? cuIdx + 7 : -1,
    UOM2_CEILING:          cuIdx >= 0 ? cuIdx + 8 : -1,
    NOTES:                 cuIdx >= 0 ? cuIdx + 9 : -1,
  };

  const rows = [];
  let skipped = 0;

  for (let i = headerRowIdx + 2; i < allRows.length; i++) {
    const row = allRows[i];
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
      sizes_data: [{ size: sizeStr, sizeNum: num(row, COL.SIZE_NUM), containerUnit: str(row, COL.CONTAINER_UNIT), sizeMm: sizeMM, sizeImperial }],
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
      search_keywords: computeKeywords([category, type, description, sizeImperial, sizeMM != null ? `${sizeMM}mm` : null, wallLabourCode, ceilingLabourCode]),
    });
  }

  console.log(`Parsed ${rows.length} rows (skipped ${skipped})`);
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const excelPath = path.join(__dirname, '../data/database-excel/Drywall Database (6-25-2026).xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error('Excel file not found:', excelPath);
    process.exit(1);
  }

  console.log('Parsing:', excelPath);
  const rows = parseMaterialsExcel(excelPath);

  // Write local JSON for reference
  const outDir = path.join(__dirname, '../data/output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'material-database.json'), JSON.stringify(rows, null, 2));
  console.log(`Wrote data/output/material-database.json (${rows.length} rows)`);

  // ── Step 1: Delete all existing material rows ───────────────────────────────
  console.log('\n--- Step 1: Deleting all existing material rows ---');
  const { error: delError } = await supabase
    .from('material_database')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (delError) { console.error('Delete failed:', delError.message); process.exit(1); }
  console.log('All existing rows deleted.');

  // ── Step 2: Insert new rows in chunks ──────────────────────────────────────
  console.log('\n--- Step 2: Inserting new rows ---');
  const CHUNK = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('material_database').insert(chunk);
    if (error) { console.error(`Insert failed at chunk ${i}:`, error.message); process.exit(1); }
    inserted += chunk.length;
    process.stdout.write(`\r  Inserted ${inserted}/${rows.length}...`);
  }

  console.log('\n');

  // ── Step 3: Verify ──────────────────────────────────────────────────────────
  const { count } = await supabase.from('material_database').select('*', { count: 'exact', head: true });
  console.log(`✓ Done. ${count} rows now in material_database.`);

  // Spot-check AT58
  const { data: spot } = await supabase
    .from('material_database')
    .select('code, wall_labour_code, ceiling_labour_code, bulkhead_labour_code')
    .eq('code', 'AT58')
    .limit(1);
  if (spot?.length) console.log('AT58 labour codes:', JSON.stringify(spot[0]));
}

main().catch(err => { console.error(err); process.exit(1); });

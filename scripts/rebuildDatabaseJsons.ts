/**
 * rebuildDatabaseJsons.ts
 *
 * Reads the updated Excel sheets and regenerates:
 *   data/json/material_database.json
 *   data/json/labour_database.json
 *
 * Run: npx tsx scripts/rebuildDatabaseJsons.ts
 *
 * Inputs:
 *   data/Drywall Database (6-29-2026).xlsx   → material_database.json
 *   data/Labour Database (6-29-2026).xlsx    → labour_database.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

// ─── Material Database ────────────────────────────────────────────────────────

function buildMaterialDatabase(): void {
  const WB_PATH = path.resolve('data', 'Drywall Database (6-29-2026).xlsx');
  const OUT_PATH = path.resolve('data', 'json', 'material_database.json');

  const wb = xlsx.readFile(WB_PATH);
  const ws = wb.Sheets['Material Data'];
  const rawRows: (string | number)[][] = xlsx.utils.sheet_to_json(ws, {
    defval: '',
    header: 1,
  }) as (string | number)[][];

  const str = (v: unknown) => String(v ?? '').trim();
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  function makeKeywords(
    category: string,
    type: string,
    description: string,
    size: string,
  ): string[] {
    const tokens = [category, type, description, size]
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
    return [...new Set(tokens)];
  }

  const records: unknown[] = [];
  let currentParentSection = '';

  for (let i = 2; i < rawRows.length; i++) {
    const row = rawRows[i];
    const col0 = str(row[0]);

    // Skip blank rows
    if (!col0 && row.every((c) => c === '')) continue;

    // Section header row (e.g. "   FRAMING  —  577 items")
    if (typeof row[0] === 'string' && isNaN(Number(row[0])) && col0 !== '') {
      // Extract the section name before the em dash
      const sectionMatch = col0.match(/([A-Za-z\s\/\-&]+?)\s*[—–-]+/);
      if (sectionMatch) {
        currentParentSection = sectionMatch[1].trim().toUpperCase();
      } else {
        currentParentSection = col0.replace(/\s+/g, ' ').trim().toUpperCase();
      }
      continue;
    }

    // Data row: col0 is row_num (a number)
    const rowNum = num(row[0]);
    if (!rowNum && !str(row[3])) continue; // skip header rows (row 0 and 1)

    const category     = str(row[1]);
    const assemblyCode = str(row[2]);
    const code         = str(row[3]);

    if (!code) continue; // skip blank code rows

    const wallLabourCode     = str(row[4]);
    const ceilingLabourCode  = str(row[5]);
    const bulkheadLabourCode = str(row[6]);
    const type               = str(row[7]);
    const description        = str(row[8]);
    const section            = str(row[9]);
    const size               = str(row[10]);
    const sizeNum            = num(row[11]);
    const unitPrice          = num(row[12]);
    const containerUnit      = str(row[13]);

    // Wall formulas (cols 14-17)
    const qty1Formula        = str(row[14]);
    const uom1               = str(row[15]);
    const qty2Formula        = str(row[16]);
    const uom2               = str(row[17]);

    // Ceiling formulas (cols 18-21)
    const qty1FormulaCeiling = str(row[18]);
    const uom1Ceiling        = str(row[19]);
    const qty2FormulaCeiling = str(row[20]);
    const uom2Ceiling        = str(row[21]);

    const notes              = str(row[22]);

    // Build sizes_data — always a single size entry from these columns
    const sizesData = size
      ? [
          {
            size,
            sizeNum,
            containerUnit: containerUnit || 'EA',
            sizeMm: null,
            sizeImperial: size,
            unitPrice,
          },
        ]
      : [];

    records.push({
      parent_section:           currentParentSection,
      row_num:                  rowNum || null,
      category,
      assembly_code:            assemblyCode,
      code,
      wall_labour_code:         wallLabourCode,
      ceiling_labour_code:      ceilingLabourCode,
      bulkhead_labour_code:     bulkheadLabourCode,
      type,
      description,
      section,
      sizes_data:               sizesData,
      unit_price:               unitPrice,
      qty1_formula:             qty1Formula,
      uom1,
      qty2_formula:             qty2Formula,
      uom2,
      qty1_formula_ceiling:     qty1FormulaCeiling,
      uom1_ceiling:             uom1Ceiling,
      qty2_formula_ceiling:     qty2FormulaCeiling,
      uom2_ceiling:             uom2Ceiling,
      notes,
      search_keywords:          makeKeywords(category, type, description, size),
    });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`✅ material_database.json — ${records.length} rows → ${OUT_PATH}`);
}

// ─── Labour Database ──────────────────────────────────────────────────────────

function buildLabourDatabase(): void {
  const WB_PATH = path.resolve('data', 'Labour Database (6-29-2026).xlsx');
  const OUT_PATH = path.resolve('data', 'json', 'labour_database.json');

  const wb = xlsx.readFile(WB_PATH);
  const ws = wb.Sheets['Labour Bunches'];
  const rawRows: (string | number)[][] = xlsx.utils.sheet_to_json(ws, {
    defval: '',
    header: 1,
  }) as (string | number)[][];

  const str = (v: unknown) => String(v ?? '').trim();
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const BAND_HEADER_MARKER = 'LABOUR CODE';

  const records: unknown[] = [];
  let currentSection = '';       // WALLS | BULKHEAD | CEILING
  let currentParentCode = '';
  let currentParentDesc = '';
  let currentCategory = '';
  let currentBands: unknown[] = [];

  function flushBundle() {
    if (!currentParentCode || currentBands.length === 0) return;
    records.push({
      parent_code:    currentParentCode,
      parent_section: currentSection,
      description:    currentParentDesc,
      category:       currentCategory,
      labour_bands:   [...currentBands],
      qty1_formula:   '',
      qty1_uom:       '',
      notes:          '',
    });
    currentBands = [];
  }

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const col0 = str(row[0]);

    if (!col0 && row.every((c) => c === '')) continue;

    // Top-level section dividers: WALLS | BULKHEAD | CEILING
    if (col0 === 'WALLS' || col0 === 'BULKHEAD' || col0 === 'CEILING') {
      flushBundle();
      currentSection = col0;
      currentParentCode = '';
      continue;
    }

    // Band header row — skip
    if (col0 === BAND_HEADER_MARKER) continue;

    // Parent bunch header line: "LAB-FRM   —   Install Framing Wall..."
    // Pattern: starts with "LAB-" followed by a code
    if (col0.startsWith('LAB-') && col0.includes('—')) {
      flushBundle();
      // Extract parent code (everything before the first —)
      const dashIdx = col0.indexOf('—');
      currentParentCode = col0.substring(0, dashIdx).trim();
      // Extract description (between — and the parenthesised children count)
      let desc = col0.substring(dashIdx + 1).trim();
      desc = desc.replace(/\s*\(\d+\s+children?\)\s*$/, '').replace(/\(no children\)$/i, '').trim();
      currentParentDesc = desc;
      // Category: derive from description
      currentCategory = currentSection;
      continue;
    }

    // Band data row: col0 is the child labour code (e.g. LAB-FRM-STD)
    if (col0.startsWith('LAB-')) {
      currentBands.push({
        labourCode:  col0,
        code:        str(row[1]),
        htBand:      str(row[2]),
        htMinFt:     num(row[3]),
        htMaxFt:     num(row[4]),
        description: str(row[5]),
        uom:         str(row[6]),
        ratePerUom:  num(row[7]),
        qty1Formula: str(row[8]),
        qty1Uom:     str(row[9]),
        notes:       str(row[10]),
        isActive:    true,
      });
    }
  }

  // Flush last bundle
  flushBundle();

  fs.writeFileSync(OUT_PATH, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`✅ labour_database.json — ${records.length} bunches → ${OUT_PATH}`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

try {
  buildMaterialDatabase();
  buildLabourDatabase();
  console.log('\nDone. Run the import scripts next:');
  console.log('  npx tsx scripts/importMaterialDatabase.ts');
  console.log('  npx tsx scripts/importLabourDatabase.ts');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}

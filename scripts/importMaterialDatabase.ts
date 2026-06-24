/**
 * importMaterialDatabase.ts
 * Reads data/json/material_database.json → upserts into Supabase material_database table.
 *
 * Run: npx tsx scripts/importMaterialDatabase.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local automatically via dotenv)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve('.env.local') });

// ─── Config ───────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'json', 'material_database.json');
const CHUNK_SIZE = 200;
const TABLE = 'material_database';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
  const records: Record<string, unknown>[] = JSON.parse(raw);
  console.log(`Loaded ${records.length} rows from ${INPUT_FILE}`);

  // Map JSON keys → DB column names (already snake_case, just strip id/timestamps)
  const rows = records.map((r) => ({
    parent_section:        r.parent_section,
    row_num:               r.row_num,
    category:              r.category,
    assembly_code:         r.assembly_code,
    code:                  r.code,
    wall_labour_code:      r.wall_labour_code,
    ceiling_labour_code:   r.ceiling_labour_code,
    bulkhead_labour_code:  r.bulkhead_labour_code,
    type:                  r.type,
    description:           r.description,
    section:               r.section,
    sizes_data:            r.sizes_data ?? [],
    unit_price:            r.unit_price,
    qty1_formula:          r.qty1_formula,
    uom1:                  r.uom1,
    qty2_formula:          r.qty2_formula,
    uom2:                  r.uom2,
    qty1_formula_ceiling:  r.qty1_formula_ceiling,
    uom1_ceiling:          r.uom1_ceiling,
    qty2_formula_ceiling:  r.qty2_formula_ceiling,
    uom2_ceiling:          r.uom2_ceiling,
    notes:                 r.notes,
    search_keywords:       r.search_keywords,
  }));

  // Truncate existing rows before re-inserting (parent_section values have changed)
  console.log('Clearing existing rows from material_database...');
  const { error: deleteError } = await supabase.from(TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) {
    console.error(`ERROR: Failed to clear table: ${deleteError.message}`);
    process.exit(1);
  }
  console.log('Table cleared.');

  const batches = chunk(rows, CHUNK_SIZE);
  let inserted = 0;
  let failed = 0;

  console.log(`Uploading in ${batches.length} batches of ${CHUNK_SIZE}...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { error } = await supabase
      .from(TABLE)
      .insert(batch);

    if (error) {
      console.error(`  Batch ${i + 1}/${batches.length} FAILED: ${error.message}`);
      failed += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  Batch ${i + 1}/${batches.length} OK (${inserted} total upserted)`);
    }
  }

  console.log('\n── Import Results ───────────────────────────────────');
  console.log(`  Upserted : ${inserted}`);
  console.log(`  Failed   : ${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

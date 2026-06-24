/**
 * importLabourDatabase.ts
 * Reads data/json/labour_database.json → upserts into Supabase labour_database table.
 *
 * Run: npx tsx scripts/importLabourDatabase.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve('.env.local') });

// ─── Config ───────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'json', 'labour_database.json');
const CHUNK_SIZE = 200;
const TABLE = 'labour_database';

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

  const rows = records.map((r) => ({
    parent_section: r.parent_section,
    description:    r.description,
    category:       r.category,
    labour_bands:   r.labour_bands ?? [],
    qty1_formula:   r.qty1_formula,
    qty1_uom:       r.qty1_uom,
    notes:          r.notes,
  }));

  // No unique key to upsert on (category/description aren't constrained) —
  // clear the table and re-insert, same approach as importMaterialDatabase.ts.
  console.log('Clearing existing rows from labour_database...');
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

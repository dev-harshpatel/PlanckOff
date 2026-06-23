/**
 * importAssemblyBunchDatabase.ts
 * Reads data/json/assembly_bunch_database.json (grouped format) →
 * flattens and upserts into Supabase assembly_bunch_database table.
 *
 * Run: npx tsx scripts/importAssemblyBunchDatabase.ts
 *
 * The JSON is grouped: { "Framing": { "FR-WALL": [...items] }, ... }
 * We flatten it back to a list of rows, restoring parent_category and branch_code.
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve('.env.local') });

// ─── Config ───────────────────────────────────────────────────────────────────

const INPUT_FILE = path.resolve('data', 'json', 'assembly_bunch_database.json');
const CHUNK_SIZE = 200;
const TABLE = 'assembly_bunch_database';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  assembly_code: string;
  item_code:     string;
  section:       string;
  layers:        number | null;
  description:   string;
  size:          string;
  labour_code:   string;
  note:          string;
  sort_order:    number;
}

interface GroupedJson {
  [parentCategory: string]: {
    [branchCode: string]: ItemRow[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function flattenGrouped(grouped: GroupedJson) {
  const rows: Record<string, unknown>[] = [];

  for (const [parentCategory, branches] of Object.entries(grouped)) {
    for (const [branchCode, items] of Object.entries(branches)) {
      for (const item of items) {
        rows.push({
          parent_category: parentCategory,
          branch_code:     branchCode,
          assembly_code:   item.assembly_code,
          item_code:       item.item_code,
          section:         item.section,
          layers:          item.layers,
          description:     item.description,
          size:            item.size,
          labour_code:     item.labour_code,
          note:            item.note,
          sort_order:      item.sort_order,
        });
      }
    }
  }

  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
  const grouped: GroupedJson = JSON.parse(raw);

  const rows = flattenGrouped(grouped);
  console.log(`Flattened ${rows.length} rows from grouped JSON`);

  // Breakdown by parent
  const byParent: Record<string, number> = {};
  for (const r of rows) {
    const p = r.parent_category as string;
    byParent[p] = (byParent[p] ?? 0) + 1;
  }
  console.log('  Rows per parent:');
  for (const [parent, count] of Object.entries(byParent)) {
    console.log(`    ${parent.padEnd(20)} ${count}`);
  }

  // Truncate the table first so re-running is idempotent
  // (no unique constraint to upsert against — branch_code + item_code + sort_order isn't unique enough)
  console.log(`\nTruncating existing ${TABLE} rows...`);
  const { error: truncErr } = await supabase.rpc('truncate_assembly_bunch_database');
  if (truncErr) {
    // Fall back to delete-all if RPC doesn't exist yet
    const { error: delErr } = await supabase.from(TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) {
      console.error(`  Could not clear table: ${delErr.message}`);
      console.error('  Run manually: DELETE FROM assembly_bunch_database;');
      process.exit(1);
    }
    console.log('  Cleared via delete-all.');
  } else {
    console.log('  Truncated via RPC.');
  }

  const batches = chunk(rows, CHUNK_SIZE);
  let inserted = 0;
  let failed = 0;

  console.log(`\nUploading in ${batches.length} batches of ${CHUNK_SIZE}...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { error } = await supabase.from(TABLE).insert(batch);

    if (error) {
      console.error(`  Batch ${i + 1}/${batches.length} FAILED: ${error.message}`);
      failed += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  Batch ${i + 1}/${batches.length} OK (${inserted} total inserted)`);
    }
  }

  console.log('\n── Import Results ───────────────────────────────────');
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Failed   : ${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

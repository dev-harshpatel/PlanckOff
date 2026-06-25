/**
 * Seed script: replaces all labour_database rows with the new parent-bunch structure.
 *
 * Run AFTER applying migration 025_labour_parent_code.sql:
 *   node scripts/seedLabourDatabase.js
 *
 * What it does:
 *   1. Deletes all existing rows (soft-deleted rows included via hard delete)
 *   2. Inserts 61 parent bunches from data/output/labour-database.json
 */

const { createClient } = require('@supabase/supabase-js');
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

async function main() {
  const jsonPath = path.join(__dirname, '../data/output/labour-database.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON not found at', jsonPath);
    console.error('Run the Excel parser first to generate it.');
    process.exit(1);
  }

  const bunches = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Loaded ${bunches.length} parent bunches from JSON`);

  // ── Step 1: Delete all existing labour rows (hard delete) ──────────────────
  console.log('\n--- Step 1: Deleting all existing labour rows ---');
  const { error: delError } = await supabase
    .from('labour_database')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

  if (delError) {
    console.error('Delete failed:', delError.message);
    process.exit(1);
  }
  console.log('All existing rows deleted.');

  // ── Step 2: Insert new parent-bunch rows ───────────────────────────────────
  console.log('\n--- Step 2: Inserting new parent-bunch rows ---');

  const CHUNK = 20;
  let inserted = 0;

  for (let i = 0; i < bunches.length; i += CHUNK) {
    const chunk = bunches.slice(i, i + CHUNK);
    const { error: insError } = await supabase.from('labour_database').insert(chunk);
    if (insError) {
      console.error(`Insert failed at chunk ${i}:`, insError.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`  Inserted ${inserted}/${bunches.length}...`);
  }

  // ── Step 3: Verify ─────────────────────────────────────────────────────────
  const { count } = await supabase
    .from('labour_database')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  console.log(`\n✓ Done. ${count} rows now in labour_database.`);

  const { data: sample } = await supabase
    .from('labour_database')
    .select('parent_code, description, parent_section')
    .limit(5);
  console.log('Sample rows:', JSON.stringify(sample, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });

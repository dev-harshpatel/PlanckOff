-- Migration 024: Drop the unique constraint on material_database.code
--
-- Migration 022 created a unique index on (code) scoped to active rows,
-- back when each code mapped to exactly one row (size was a flat column).
-- Migration 023 moved size data into the sizes_data JSONB array, and the
-- importer was reverted to keep one row per Excel row — so the SAME code
-- can legitimately appear on multiple rows again, one per size variant
-- (e.g. a furring channel sold in both 10' and 16' lengths). The unique
-- index now incorrectly blocks those rows.
--
-- Replaced with a non-unique index, since `code` is still filtered/searched
-- frequently (list queries, ilike search, delete-by-code on re-import).

DROP INDEX IF EXISTS material_database_code_idx;
CREATE INDEX IF NOT EXISTS material_database_code_idx
  ON material_database (code) WHERE deleted_at IS NULL;

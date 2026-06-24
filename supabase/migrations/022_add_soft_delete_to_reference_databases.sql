-- Migration: 022_add_soft_delete_to_reference_databases.sql
-- Adds soft-delete (trash) support to material_database, labour_database,
-- and assembly_bunch_database. Soft-deleted rows are hidden from normal
-- queries and purged permanently 30 days later by a scheduled cron job
-- (see src/app/api/cron/cleanup-database-trash/route.ts).

ALTER TABLE material_database ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE labour_database ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE assembly_bunch_database ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS material_database_deleted_at_idx ON material_database (deleted_at);
CREATE INDEX IF NOT EXISTS labour_database_deleted_at_idx ON labour_database (deleted_at);
CREATE INDEX IF NOT EXISTS assembly_bunch_database_deleted_at_idx ON assembly_bunch_database (deleted_at);

-- Pre-existing duplicate codes (from before soft-delete existed) would violate
-- the partial unique indexes below. Soft-delete the older duplicates into
-- trash — keeping the most recently created row per code/labour_code+ht_band —
-- rather than destroying data.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY code ORDER BY created_at DESC, id DESC) AS rn
  FROM material_database
  WHERE deleted_at IS NULL
)
UPDATE material_database m
SET deleted_at = NOW()
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY labour_code, ht_band ORDER BY created_at DESC, id DESC) AS rn
  FROM labour_database
  WHERE deleted_at IS NULL
)
UPDATE labour_database l
SET deleted_at = NOW()
FROM ranked r
WHERE l.id = r.id AND r.rn > 1;

-- Re-scope unique constraints to active (non-deleted) rows only, so a
-- soft-deleted code / labour_code+ht_band can be reused by a new active row.
DROP INDEX IF EXISTS material_database_code_idx;
CREATE UNIQUE INDEX IF NOT EXISTS material_database_code_idx
  ON material_database (code) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS labour_database_code_band_idx;
CREATE UNIQUE INDEX IF NOT EXISTS labour_database_code_band_idx
  ON labour_database (labour_code, ht_band) WHERE deleted_at IS NULL;

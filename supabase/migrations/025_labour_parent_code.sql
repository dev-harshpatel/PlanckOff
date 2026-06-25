-- Migration 025: Add parent_code to labour_database
--
-- Shifts labour data from "one row per child band" to "one row per parent bunch".
-- parent_code stores the parent identifier (e.g. LAB-FRM) that material rows
-- reference via wall_labour_code / ceiling_labour_code / bulkhead_labour_code.
-- labour_bands JSONB entries now also carry description, qty1Formula, qty1Uom,
-- and notes at the per-band level.

ALTER TABLE labour_database
  ADD COLUMN IF NOT EXISTS parent_code VARCHAR(64) NOT NULL DEFAULT '';

-- Index for fast lookup by parent_code (resolveMatchedLabour, material link-out)
CREATE INDEX IF NOT EXISTS idx_labour_database_parent_code
  ON labour_database (parent_code)
  WHERE deleted_at IS NULL;

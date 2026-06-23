-- Migration: 021_create_material_labour_databases.sql
-- Creates three new database tables:
--   material_database   ← from Drywall Database Excel
--   labour_database     ← from Labour Database Excel
--   assembly_bunch_database ← from Default Assembly Branch Excel
--
-- spec_database table is RETAINED in Supabase but no longer used by application code.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. material_database
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_database (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  parent_section         TEXT NOT NULL DEFAULT '',  -- Walls | Ceiling

  -- Identity
  row_num                INTEGER,
  category               TEXT NOT NULL DEFAULT '',
  assembly_code          TEXT NOT NULL DEFAULT '',
  code                   TEXT NOT NULL,

  -- Labour code links (resolved at match time → labour_database)
  wall_labour_code       TEXT NOT NULL DEFAULT '',
  ceiling_labour_code    TEXT NOT NULL DEFAULT '',
  bulkhead_labour_code   TEXT NOT NULL DEFAULT '',

  -- Classification
  type                   TEXT NOT NULL DEFAULT '',
  description            TEXT NOT NULL DEFAULT '',
  section                TEXT NOT NULL DEFAULT '',
  size                   TEXT NOT NULL DEFAULT '',
  size_num               NUMERIC(10,4) NOT NULL DEFAULT 0,
  size_mm                NUMERIC(10,4),
  size_imperial          TEXT,

  -- Pricing
  unit_price             NUMERIC(12,4) NOT NULL DEFAULT 0,
  container_unit         TEXT NOT NULL DEFAULT '',

  -- Wall formulas
  qty1_formula           TEXT NOT NULL DEFAULT '',
  uom1                   TEXT NOT NULL DEFAULT '',
  qty2_formula           TEXT NOT NULL DEFAULT '',
  uom2                   TEXT NOT NULL DEFAULT '',

  -- Ceiling formulas
  qty1_formula_ceiling   TEXT NOT NULL DEFAULT '',
  uom1_ceiling           TEXT NOT NULL DEFAULT '',
  qty2_formula_ceiling   TEXT NOT NULL DEFAULT '',
  uom2_ceiling           TEXT NOT NULL DEFAULT '',

  notes                  TEXT NOT NULL DEFAULT '',

  -- Full-text search aid
  search_keywords        TEXT[] NOT NULL DEFAULT '{}',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_database_code_idx ON material_database (code);
CREATE INDEX IF NOT EXISTS material_database_parent_section_idx ON material_database (parent_section);
CREATE INDEX IF NOT EXISTS material_database_category_idx ON material_database (category);
CREATE INDEX IF NOT EXISTS material_database_type_idx ON material_database (type);
CREATE INDEX IF NOT EXISTS material_database_size_mm_idx ON material_database (size_mm);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. labour_database
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labour_database (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  parent_section TEXT NOT NULL DEFAULT '',  -- Walls | Ceiling | Bulkhead

  -- Identity
  labour_code   TEXT NOT NULL,
  code          TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',

  -- Height band (determines which row to pick for a given wall height)
  ht_band       TEXT NOT NULL DEFAULT 'All',
  ht_min_ft     NUMERIC(6,2) NOT NULL DEFAULT 0,
  ht_max_ft     NUMERIC(6,2) NOT NULL DEFAULT 99,

  -- Rate
  uom           TEXT NOT NULL DEFAULT '',
  rate_per_uom  NUMERIC(12,4) NOT NULL DEFAULT 0,

  -- Quantity formula
  qty1_formula  TEXT NOT NULL DEFAULT '',
  qty1_uom      TEXT NOT NULL DEFAULT '',

  notes         TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite unique: same labour_code can appear multiple times (once per ht_band)
CREATE UNIQUE INDEX IF NOT EXISTS labour_database_code_band_idx
  ON labour_database (labour_code, ht_band);

CREATE INDEX IF NOT EXISTS labour_database_labour_code_idx ON labour_database (labour_code);
CREATE INDEX IF NOT EXISTS labour_database_parent_section_idx ON labour_database (parent_section);
CREATE INDEX IF NOT EXISTS labour_database_category_idx ON labour_database (category);
CREATE INDEX IF NOT EXISTS labour_database_ht_band_idx ON labour_database (ht_band);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. assembly_bunch_database
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assembly_bunch_database (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Hierarchy
  parent_category TEXT NOT NULL DEFAULT '',   -- Framing | Drywall | Sheathing | Insulation | Ceiling Systems
  branch_code     TEXT NOT NULL,              -- FR-WALL | DW-SGL-WALL | INS-WALL | etc.

  -- Item identity
  assembly_code   TEXT NOT NULL DEFAULT '',
  item_code       TEXT NOT NULL,              -- XXXXXXX = placeholder, resolved at match time
  section         TEXT NOT NULL DEFAULT '',
  layers          INTEGER,                    -- NULL = not specified, 1 = single, 2 = double

  -- Description / lookup hints
  description     TEXT NOT NULL DEFAULT '',
  size            TEXT NOT NULL DEFAULT '',
  labour_code     TEXT NOT NULL DEFAULT '',   -- FK → labour_database.labour_code
  note            TEXT NOT NULL DEFAULT '',

  -- Display order within a branch
  sort_order      INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assembly_bunch_branch_code_idx ON assembly_bunch_database (branch_code);
CREATE INDEX IF NOT EXISTS assembly_bunch_parent_category_idx ON assembly_bunch_database (parent_category);
CREATE INDEX IF NOT EXISTS assembly_bunch_item_code_idx ON assembly_bunch_database (item_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-update updated_at on row change
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'material_database_updated_at'
  ) THEN
    CREATE TRIGGER material_database_updated_at
      BEFORE UPDATE ON material_database
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'labour_database_updated_at'
  ) THEN
    CREATE TRIGGER labour_database_updated_at
      BEFORE UPDATE ON labour_database
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'assembly_bunch_database_updated_at'
  ) THEN
    CREATE TRIGGER assembly_bunch_database_updated_at
      BEFORE UPDATE ON assembly_bunch_database
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

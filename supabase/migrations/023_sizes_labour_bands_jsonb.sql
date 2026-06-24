-- Migration 023: Convert flat size/labour columns to JSONB arrays
--
-- material_database: adds sizes_data jsonb, migrates existing flat columns, drops them
-- labour_database:   adds labour_bands jsonb, migrates existing flat columns, drops them

-- ─── material_database ────────────────────────────────────────────────────────

ALTER TABLE material_database
  ADD COLUMN IF NOT EXISTS sizes_data jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate any existing flat-column data into the new array (only for rows not yet migrated)
UPDATE material_database
SET sizes_data = jsonb_build_array(
  jsonb_build_object(
    'size',          COALESCE(size, ''),
    'sizeNum',       COALESCE(size_num, 0),
    'containerUnit', COALESCE(container_unit, ''),
    'sizeMm',        size_mm,
    'sizeImperial',  size_imperial
  )
)
WHERE
  (sizes_data = '[]'::jsonb OR sizes_data IS NULL)
  AND (
    (size IS NOT NULL AND size <> '')
    OR (size_num IS NOT NULL AND size_num <> 0)
    OR (container_unit IS NOT NULL AND container_unit <> '')
  );

ALTER TABLE material_database
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS size_num,
  DROP COLUMN IF EXISTS size_mm,
  DROP COLUMN IF EXISTS size_imperial,
  DROP COLUMN IF EXISTS container_unit;

-- ─── labour_database ─────────────────────────────────────────────────────────

ALTER TABLE labour_database
  ADD COLUMN IF NOT EXISTS labour_bands jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate any existing flat-column data
UPDATE labour_database
SET labour_bands = jsonb_build_array(
  jsonb_build_object(
    'labourCode',  COALESCE(labour_code, ''),
    'code',        COALESCE(code, ''),
    'htBand',      COALESCE(ht_band, 'All'),
    'htMinFt',     COALESCE(ht_min_ft, 0),
    'htMaxFt',     COALESCE(ht_max_ft, 99),
    'uom',         COALESCE(uom, ''),
    'ratePerUom',  COALESCE(rate_per_uom, 0)
  )
)
WHERE
  (labour_bands = '[]'::jsonb OR labour_bands IS NULL)
  AND (labour_code IS NOT NULL AND labour_code <> '');

ALTER TABLE labour_database
  DROP COLUMN IF EXISTS labour_code,
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS ht_band,
  DROP COLUMN IF EXISTS ht_min_ft,
  DROP COLUMN IF EXISTS ht_max_ft,
  DROP COLUMN IF EXISTS uom,
  DROP COLUMN IF EXISTS rate_per_uom;

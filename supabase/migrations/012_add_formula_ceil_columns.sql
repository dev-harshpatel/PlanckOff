-- Add ceiling formula columns to spec_database table
ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS formula_ceil_qty TEXT,
  ADD COLUMN IF NOT EXISTS formula_ceil_sec_qty TEXT;

-- Add new columns to spec_database table
ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS sheet_bag_box TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS screw_spacing TEXT,
  ADD COLUMN IF NOT EXISTS formula_qty TEXT,
  ADD COLUMN IF NOT EXISTS formula_sec_qty TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

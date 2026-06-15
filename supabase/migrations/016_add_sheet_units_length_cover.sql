ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS sheet_bag_box_size_units TEXT,
  ADD COLUMN IF NOT EXISTS length_cover TEXT,
  ADD COLUMN IF NOT EXISTS length_cover_units TEXT;

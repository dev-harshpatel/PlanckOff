-- Add MOU (Measure of Unit) columns to spec_database table
-- These store the unit of measure for each formula result (e.g., SF, EA, LF)

ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS mou_wall TEXT,           -- MOU for wall qty formula (e.g., SF)
  ADD COLUMN IF NOT EXISTS mou_wall_sec TEXT,       -- MOU for wall sec. qty formula (e.g., EA)
  ADD COLUMN IF NOT EXISTS mou_ceil TEXT,           -- MOU for ceiling qty formula (e.g., SF)
  ADD COLUMN IF NOT EXISTS mou_ceil_sec TEXT;       -- MOU for ceiling sec. qty formula (e.g., EA)

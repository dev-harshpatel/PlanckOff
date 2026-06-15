-- Add size_of_unit column for Excel "size of Unit" (distinct from length_cover / AREA LENGTH COVER)
-- Used for: Production Rate (per unit) = Unit Cost / size of Unit
ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS size_of_unit NUMERIC;

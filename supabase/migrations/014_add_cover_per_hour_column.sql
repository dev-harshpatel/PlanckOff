-- Add cover_per_hour column to spec_database table
-- This aligns the database schema with the updated material-database.json,
-- which now includes a "coverPerHour" field for certain (primarily labor) items.

ALTER TABLE spec_database
  ADD COLUMN IF NOT EXISTS cover_per_hour NUMERIC;


-- Create spec_database table for material definitions
CREATE TABLE IF NOT EXISTS spec_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  section TEXT NOT NULL DEFAULT '00 00 00',
  mat_cost_code TEXT NOT NULL DEFAULT 'GEN',
  labor_cost_code TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Material',
  manufacturer TEXT NOT NULL DEFAULT 'Generic',
  description TEXT NOT NULL,
  mat_cost NUMERIC NOT NULL DEFAULT 0,
  per TEXT NOT NULL DEFAULT '1 EA',
  price_updated TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  width TEXT,
  gauge TEXT,
  flange TEXT,
  productivity NUMERIC,
  hourly_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_spec_database_code ON spec_database(code);
CREATE INDEX IF NOT EXISTS idx_spec_database_category ON spec_database(category);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_spec_database_updated_at
  BEFORE UPDATE ON spec_database
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE spec_database ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated users to read spec_database"
  ON spec_database
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Allow authenticated users to insert spec_database"
  ON spec_database
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update spec_database"
  ON spec_database
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete
CREATE POLICY "Allow authenticated users to delete spec_database"
  ON spec_database
  FOR DELETE
  TO authenticated
  USING (true);

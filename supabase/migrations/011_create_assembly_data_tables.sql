-- Create table to store assembly extraction data
CREATE TABLE IF NOT EXISTS assembly_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

-- Create table to store material matching data
CREATE TABLE IF NOT EXISTS material_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  extraction_id UUID REFERENCES assembly_extractions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assembly_extractions_project_id ON assembly_extractions(project_id);
CREATE INDEX IF NOT EXISTS idx_assembly_extractions_created_at ON assembly_extractions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_matches_project_id ON material_matches(project_id);
CREATE INDEX IF NOT EXISTS idx_material_matches_extraction_id ON material_matches(extraction_id);
CREATE INDEX IF NOT EXISTS idx_material_matches_created_at ON material_matches(created_at DESC);

-- Enable Row Level Security
ALTER TABLE assembly_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_matches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own assembly extractions" ON assembly_extractions;
DROP POLICY IF EXISTS "Users can insert their own assembly extractions" ON assembly_extractions;
DROP POLICY IF EXISTS "Users can delete their own assembly extractions" ON assembly_extractions;
DROP POLICY IF EXISTS "Users can view their own material matches" ON material_matches;
DROP POLICY IF EXISTS "Users can insert their own material matches" ON material_matches;
DROP POLICY IF EXISTS "Users can delete their own material matches" ON material_matches;

-- RLS Policies for assembly_extractions
CREATE POLICY "Users can view their own assembly extractions"
  ON assembly_extractions FOR SELECT
  USING (auth.uid() IN (
    SELECT id FROM admins WHERE id = created_by
  ));

CREATE POLICY "Users can insert their own assembly extractions"
  ON assembly_extractions FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own assembly extractions"
  ON assembly_extractions FOR DELETE
  USING (auth.uid() = created_by);

-- RLS Policies for material_matches
CREATE POLICY "Users can view their own material matches"
  ON material_matches FOR SELECT
  USING (auth.uid() IN (
    SELECT id FROM admins WHERE id = created_by
  ));

CREATE POLICY "Users can insert their own material matches"
  ON material_matches FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own material matches"
  ON material_matches FOR DELETE
  USING (auth.uid() = created_by);

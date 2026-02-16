-- Pipeline output tables: takeoff and final_output
-- Stores JSON outputs from process-pipeline (data/output/takeoff, data/output/final_output)
-- assembly_extractions already stores assembly output (data/output/assembly)

-- Takeoff output: parsed Excel takeoff data
CREATE TABLE IF NOT EXISTS takeoff_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

-- Final output: QuickBid-style JSON from unified AI prompt
CREATE TABLE IF NOT EXISTS final_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assembly_extraction_id UUID REFERENCES assembly_extractions(id) ON DELETE SET NULL,
  takeoff_output_id UUID REFERENCES takeoff_outputs(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_takeoff_outputs_project_id ON takeoff_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_outputs_created_at ON takeoff_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_final_outputs_project_id ON final_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_final_outputs_created_at ON final_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_final_outputs_assembly_extraction_id ON final_outputs(assembly_extraction_id);
CREATE INDEX IF NOT EXISTS idx_final_outputs_takeoff_output_id ON final_outputs(takeoff_output_id);

-- RLS
ALTER TABLE takeoff_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_outputs ENABLE ROW LEVEL SECURITY;

-- Policies: allow service role (supabaseAdmin) full access; RLS uses created_by for user-scoped
DROP POLICY IF EXISTS "Users can view takeoff outputs" ON takeoff_outputs;
DROP POLICY IF EXISTS "Users can insert takeoff outputs" ON takeoff_outputs;
DROP POLICY IF EXISTS "Users can delete takeoff outputs" ON takeoff_outputs;
DROP POLICY IF EXISTS "Users can view final outputs" ON final_outputs;
DROP POLICY IF EXISTS "Users can insert final outputs" ON final_outputs;
DROP POLICY IF EXISTS "Users can delete final outputs" ON final_outputs;

CREATE POLICY "Users can view takeoff outputs"
  ON takeoff_outputs FOR SELECT
  USING (created_by IS NULL OR auth.uid() IN (SELECT id FROM admins WHERE id = created_by));

CREATE POLICY "Users can insert takeoff outputs"
  ON takeoff_outputs FOR INSERT
  WITH CHECK (created_by IS NULL OR auth.uid() = created_by);

CREATE POLICY "Users can delete takeoff outputs"
  ON takeoff_outputs FOR DELETE
  USING (created_by IS NULL OR auth.uid() = created_by);

CREATE POLICY "Users can view final outputs"
  ON final_outputs FOR SELECT
  USING (created_by IS NULL OR auth.uid() IN (SELECT id FROM admins WHERE id = created_by));

CREATE POLICY "Users can insert final outputs"
  ON final_outputs FOR INSERT
  WITH CHECK (created_by IS NULL OR auth.uid() = created_by);

CREATE POLICY "Users can delete final outputs"
  ON final_outputs FOR DELETE
  USING (created_by IS NULL OR auth.uid() = created_by);

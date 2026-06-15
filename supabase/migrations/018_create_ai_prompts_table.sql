-- Create table to store global AI prompts used by the pipeline
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL UNIQUE CHECK (
    prompt_key IN ('pdf_extraction', 'material_match')
  ),
  prompt_text TEXT NOT NULL,
  updated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_prompt_key ON ai_prompts(prompt_key);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_updated_at ON ai_prompts(updated_at DESC);

CREATE OR REPLACE FUNCTION update_ai_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ai_prompts_updated_at ON ai_prompts;
CREATE TRIGGER trigger_update_ai_prompts_updated_at
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_prompts_updated_at();

ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to ai_prompts" ON ai_prompts;
CREATE POLICY "Service role has full access to ai_prompts"
  ON ai_prompts
  FOR ALL
  USING (true)
  WITH CHECK (true);

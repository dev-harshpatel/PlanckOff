-- Pipeline run tracking table
-- Every pipeline run (extract → match → finalize) is recorded here.
-- runId from this table is passed to each step for tracking and retry.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID,       -- team_members.id or admins.id — no FK to support both auth systems
  status          TEXT        NOT NULL DEFAULT 'running',  -- 'running' | 'complete' | 'failed'
  current_step    INTEGER     NOT NULL DEFAULT 0,          -- 0=pre-flight, 1=extract, 2=match, 3=finalize
  error_step      INTEGER,                                 -- which step failed
  error_message   TEXT,                                    -- error detail on failure

  -- Step output IDs (populated as each step completes — no FK to allow partial runs)
  takeoff_output_id   UUID,   -- set after step 0 (parse-takeoff)
  extraction_id       UUID,   -- set after step 1 (extract)
  match_id            UUID,   -- set after step 2 (match)
  final_output_id     UUID,   -- set after step 3 (finalize)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project ON pipeline_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status  ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs(created_at DESC);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Service role (supabaseAdmin) bypasses RLS — all server-side writes are safe.
-- These policies cover any future anon/user client usage.
CREATE POLICY "pipeline_runs_select" ON pipeline_runs
  FOR SELECT USING (true);

CREATE POLICY "pipeline_runs_insert" ON pipeline_runs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "pipeline_runs_update" ON pipeline_runs
  FOR UPDATE USING (true);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- NULL until password is set via invitation
  name VARCHAR(255) NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  initials VARCHAR(10),
  status VARCHAR(20) DEFAULT 'Invited' CHECK (status IN ('Active', 'Invited', 'Inactive')),
  invited_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reports_to UUID REFERENCES team_members(id) ON DELETE SET NULL, -- For hierarchy
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to team_members"
  ON team_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_role_id ON team_members(role_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);
CREATE INDEX IF NOT EXISTS idx_team_members_reports_to ON team_members(reports_to);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_team_members_updated_at();

-- Migrate existing admin user to team_members
INSERT INTO team_members (email, password_hash, name, role_id, initials, status, created_at, updated_at)
SELECT
  a.email,
  a.password_hash,
  a.name,
  r.id as role_id,
  a.initials,
  'Active' as status,
  a.created_at,
  a.updated_at
FROM admins a
JOIN roles r ON r.name = 'Administrator'
ON CONFLICT (email) DO NOTHING;

-- Update auth_sessions to reference team_members instead of admins
-- First, add a new column for team_member_id
ALTER TABLE auth_sessions
ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;

-- Update existing sessions to point to team_members
UPDATE auth_sessions s
SET team_member_id = tm.id
FROM admins a
JOIN team_members tm ON tm.email = a.email
WHERE s.admin_id = a.id
AND s.team_member_id IS NULL;

-- Create index on team_member_id
CREATE INDEX IF NOT EXISTS idx_auth_sessions_team_member_id ON auth_sessions(team_member_id);

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  level INTEGER NOT NULL, -- 1=Admin, 2=Team Lead, 3=Estimator (lower = higher authority)
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to roles"
  ON roles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed initial roles
INSERT INTO roles (name, level, description) VALUES
  ('Administrator', 1, 'Full system access and team management'),
  ('Team Lead', 2, 'Manage estimators and oversee projects'),
  ('Estimator', 3, 'Create and manage estimates')
ON CONFLICT (name) DO NOTHING;

-- Create index on role name for faster lookups
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_level ON roles(level);

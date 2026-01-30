-- Fix auth_sessions to allow null admin_id for team_members
-- This is needed because new users from team_members table won't have entries in admins table

-- Drop the existing foreign key constraint on admin_id
ALTER TABLE auth_sessions
DROP CONSTRAINT IF EXISTS auth_sessions_admin_id_fkey;

-- Make admin_id nullable
ALTER TABLE auth_sessions
ALTER COLUMN admin_id DROP NOT NULL;

-- Re-add the foreign key constraint allowing nulls
ALTER TABLE auth_sessions
ADD CONSTRAINT auth_sessions_admin_id_fkey
FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE;

-- Ensure team_member_id column exists (in case migration 004/005 wasn't run)
ALTER TABLE auth_sessions
ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_auth_sessions_team_member_id ON auth_sessions(team_member_id);

-- Add check constraint to ensure at least one of admin_id or team_member_id is set
-- (Optional: uncomment if you want to enforce this at DB level)
-- ALTER TABLE auth_sessions
-- ADD CONSTRAINT auth_sessions_user_required
-- CHECK (admin_id IS NOT NULL OR team_member_id IS NOT NULL);

-- Phase 5 — Deprecate admins table (Pillar 1 auth cleanup)
-- Safe to run multiple times (idempotent).

-- 1. Add is_legacy flag to team_members so migrated rows are identifiable.
ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Migrate any admins not yet in team_members.
--    Uses the correct role mapping (admins.role = roles.name) — migration 005 hardcoded
--    'Administrator' for all admins, which was wrong. ON CONFLICT (email) DO UPDATE
--    corrects the role_id and marks the row as legacy.
INSERT INTO team_members (
  email,
  password_hash,
  name,
  role_id,
  initials,
  status,
  is_legacy,
  created_at,
  updated_at
)
SELECT
  a.email,
  a.password_hash,
  a.name,
  r.id        AS role_id,
  a.initials,
  'Active'    AS status,
  TRUE        AS is_legacy,
  a.created_at,
  a.updated_at
FROM admins a
JOIN roles r ON r.name = a.role
ON CONFLICT (email) DO UPDATE
  SET is_legacy = TRUE,
      role_id   = EXCLUDED.role_id,
      password_hash = COALESCE(team_members.password_hash, EXCLUDED.password_hash);

-- 3. Re-link auth_sessions that still only have admin_id set (no team_member_id).
--    Joins admins → team_members via email to find the correct team_member UUID.
UPDATE auth_sessions s
SET team_member_id = tm.id
FROM admins a
JOIN team_members tm ON tm.email = a.email
WHERE s.admin_id = a.id
  AND s.team_member_id IS NULL;

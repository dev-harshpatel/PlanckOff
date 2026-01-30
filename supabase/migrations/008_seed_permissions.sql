-- Seed initial permissions
INSERT INTO permissions (code, name, description, category) VALUES
  -- Team Management permissions
  ('team.view', 'View Team Members', 'View list of team members and their details', 'Team'),
  ('team.invite', 'Invite Members', 'Send invitations to new team members', 'Team'),
  ('team.edit', 'Edit Members', 'Edit team member details', 'Team'),
  ('team.delete', 'Delete Members', 'Remove team members from the organization', 'Team'),

  -- Project permissions
  ('projects.view', 'View Projects', 'View list of projects', 'Projects'),
  ('projects.create', 'Create Projects', 'Create new projects', 'Projects'),
  ('projects.edit', 'Edit Projects', 'Edit existing projects', 'Projects'),
  ('projects.delete', 'Delete Projects', 'Delete projects', 'Projects'),
  ('projects.assign', 'Assign Projects', 'Assign projects to team members', 'Projects'),

  -- Estimate permissions
  ('estimates.view', 'View Estimates', 'View estimates and takeoffs', 'Estimates'),
  ('estimates.create', 'Create Estimates', 'Create new estimates', 'Estimates'),
  ('estimates.edit', 'Edit Estimates', 'Edit existing estimates', 'Estimates'),
  ('estimates.delete', 'Delete Estimates', 'Delete estimates', 'Estimates'),
  ('estimates.approve', 'Approve Estimates', 'Approve and finalize estimates', 'Estimates'),

  -- Database permissions
  ('database.view', 'View Database', 'View materials and assemblies database', 'Database'),
  ('database.edit', 'Edit Database', 'Edit materials and assemblies', 'Database'),

  -- Settings permissions
  ('settings.view', 'View Settings', 'View application settings', 'Settings'),
  ('settings.edit', 'Edit Settings', 'Modify application settings', 'Settings'),

  -- Admin permissions
  ('admin.access', 'Admin Access', 'Access admin panel', 'Admin'),
  ('admin.roles', 'Manage Roles', 'Create, edit, and delete roles', 'Admin'),
  ('admin.permissions', 'Manage Permissions', 'Assign permissions to roles', 'Admin')
ON CONFLICT (code) DO NOTHING;

-- Assign permissions to existing roles

-- Administrator gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Administrator'
ON CONFLICT DO NOTHING;

-- Team Lead gets team management, projects, estimates, database view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Team Lead'
  AND p.code IN (
    'team.view', 'team.invite', 'team.edit',
    'projects.view', 'projects.create', 'projects.edit', 'projects.assign',
    'estimates.view', 'estimates.create', 'estimates.edit', 'estimates.approve',
    'database.view', 'database.edit',
    'settings.view'
  )
ON CONFLICT DO NOTHING;

-- Estimator gets basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Estimator'
  AND p.code IN (
    'team.view',
    'projects.view',
    'estimates.view', 'estimates.create', 'estimates.edit',
    'database.view',
    'settings.view'
  )
ON CONFLICT DO NOTHING;

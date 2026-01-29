-- Seed the admin user
-- Password: Harsh@178
-- Hash generated with bcrypt cost factor 12
INSERT INTO admins (email, password_hash, name, role, initials)
VALUES (
  'harsh@planckoff.com',
  '$2b$12$yja8WTP7mCl9CZAHMrjUt.eBkNXAc6tQf73oOksSm200XNCex4vei',
  'Harsh',
  'Administrator',
  'H'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  initials = EXCLUDED.initials,
  updated_at = NOW();

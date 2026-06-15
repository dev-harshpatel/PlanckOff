/**
 * Authentication Constants
 * Centralized configuration for auth-related settings
 */

// Session configuration
export const AUTH_CONFIG = {
  SESSION_DURATION_DAYS: 7,
  SESSION_RENEWAL_WINDOW_HOURS: 24,
  SESSION_COOKIE_NAME: 'auth_session',
  BCRYPT_SALT_ROUNDS: 12,
} as const;

// Cookie configuration
export const COOKIE_CONFIG = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// Database table names (prevents typos, enables easy renaming)
export const DB_TABLES = {
  ADMINS: 'admins',
  AUTH_SESSIONS: 'auth_sessions',
} as const;

// Error codes from PostgreSQL/PostgREST
export const DB_ERROR_CODES = {
  TABLE_NOT_FOUND: '42P01',
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_FOUND: 'PGRST116',
} as const;

// User-facing error messages
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  MISSING_CREDENTIALS: 'Email and password are required',
  SESSION_CREATION_FAILED: 'Failed to create session',
  SESSION_INVALID: 'Session is invalid or expired',
  DATABASE_NOT_CONFIGURED: 'Database not configured. Please run migrations.',
  INTERNAL_ERROR: 'Internal server error',
} as const;

// Fields to select from admins table (excludes password_hash)
export const ADMIN_PUBLIC_FIELDS = 'id, email, name, role, initials' as const;

// Fields for session with joined team_member.
// The admins table join has been removed — all users now resolve via team_members.
export const SESSION_WITH_ADMIN_FIELDS = `
  id,
  token,
  expires_at,
  team_member:team_members (
    id,
    email,
    name,
    initials,
    role:roles (
      name
    )
  )
` as const;

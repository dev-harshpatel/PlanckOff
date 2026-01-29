/**
 * Auth Repository
 * All authentication-related database operations
 *
 * This follows the Repository Pattern - isolating database logic
 * from API routes makes code reusable and testable.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import {
  AdminRow,
  AuthSessionInsert,
  SessionWithAdmin,
} from "@/lib/supabase/types";
import {
  DB_TABLES,
  AUTH_CONFIG,
  SESSION_WITH_ADMIN_FIELDS,
} from "@/constants/auth";

/**
 * Find an admin by email
 *
 * Supabase Query Explanation:
 * - from('admins') → SELECT FROM admins
 * - select('*') → SELECT all columns
 * - eq('email', email) → WHERE email = ?
 * - single() → LIMIT 1, returns object instead of array
 */
export async function findAdminByEmail(email: string): Promise<{
  data: AdminRow | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(DB_TABLES.ADMINS)
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  return { data, error };
}

/**
 * Create a new auth session
 *
 * Supabase Query Explanation:
 * - from('auth_sessions') → INSERT INTO auth_sessions
 * - insert({...}) → VALUES (...)
 * - select('token') → RETURNING token (PostgreSQL feature)
 * - single() → Returns the inserted row as object
 */
export async function createSession(params: {
  adminId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  data: { token: string } | null;
  error: { message: string; code: string } | null;
}> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + AUTH_CONFIG.SESSION_DURATION_DAYS);

  const sessionData: AuthSessionInsert = {
    admin_id: params.adminId,
    expires_at: expiresAt.toISOString(),
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
  };

  const { data, error } = await supabaseAdmin
    .from(DB_TABLES.AUTH_SESSIONS)
    .insert(sessionData)
    .select("token")
    .single();

  return { data, error };
}

/**
 * Find session by token with admin data (JOIN)
 *
 * Supabase Query Explanation:
 * - select(`id, expires_at, admin:admins (...)`) → This creates a JOIN
 *   The syntax `admin:admins (fields)` means:
 *   - "admin" is the alias for the result
 *   - "admins" is the related table (detected via foreign key)
 *   - Fields in parentheses are selected from that table
 *
 * This translates to:
 * SELECT auth_sessions.id, auth_sessions.expires_at,
 *        admins.id, admins.email, admins.name, admins.role, admins.initials
 * FROM auth_sessions
 * LEFT JOIN admins ON auth_sessions.admin_id = admins.id
 * WHERE auth_sessions.token = ?
 */
export async function findSessionByToken(token: string): Promise<{
  data: SessionWithAdmin | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(DB_TABLES.AUTH_SESSIONS)
    .select(SESSION_WITH_ADMIN_FIELDS)
    .eq("token", token)
    .single();

  return {
    data: data as SessionWithAdmin | null,
    error,
  };
}

/**
 * Delete session by token
 *
 * Supabase Query Explanation:
 * - delete() → DELETE FROM auth_sessions
 * - eq('token', token) → WHERE token = ?
 */
export async function deleteSessionByToken(token: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(DB_TABLES.AUTH_SESSIONS)
    .delete()
    .eq("token", token);

  return { error };
}

/**
 * Delete session by ID
 */
export async function deleteSessionById(id: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(DB_TABLES.AUTH_SESSIONS)
    .delete()
    .eq("id", id);

  return { error };
}

/**
 * Clean up expired sessions (maintenance function)
 *
 * Supabase Query Explanation:
 * - delete() → DELETE FROM auth_sessions
 * - lt('expires_at', date) → WHERE expires_at < ? (lt = less than)
 */
export async function cleanupExpiredSessions(): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(DB_TABLES.AUTH_SESSIONS)
    .delete()
    .lt("expires_at", new Date().toISOString());

  return { error };
}

/**
 * Check if a session is expired
 */
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

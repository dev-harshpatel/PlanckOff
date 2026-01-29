/**
 * Supabase Database Types
 * These types mirror the database schema for type-safe queries
 */

// Database row types (what Supabase returns)
export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  initials: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionRow {
  id: string;
  admin_id: string;
  token: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Insert types (what we send to Supabase)
export interface AuthSessionInsert {
  admin_id: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

// Join result types
export interface SessionWithAdmin {
  id: string;
  token: string;
  expires_at: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    initials: string | null;
  } | null;
}

// Supabase query result type helper
export interface SupabaseQueryResult<T> {
  data: T | null;
  error: SupabaseError | null;
}

export interface SupabaseError {
  message: string;
  code: string;
  details?: string;
  hint?: string;
}

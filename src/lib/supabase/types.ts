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
  team_member_id: string | null; // New field for team_members table
  token: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Insert types (what we send to Supabase)
export interface AuthSessionInsert {
  team_member_id: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

// Join result types
export interface SessionWithAdmin {
  id: string;
  token: string;
  expires_at: string;
  team_member: {
    id: string;
    email: string;
    name: string;
    initials: string | null;
    role: {
      name: string;
    };
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

/**
 * Authentication types
 */

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
  initials: string;
}

export interface AuthSession {
  id: string;
  admin_id: string;
  token: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: Admin | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: Admin;
  error?: string;
}

export interface SessionResponse {
  valid: boolean;
  user?: Admin;
  error?: string;
  code?: string;
}

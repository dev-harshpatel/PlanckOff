'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { Admin, AuthState, LoginCredentials, LoginResponse, SessionResponse } from '@/types/auth';

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: (showLoading?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Minimum ms between background re-validations (focus/visibility).
// The initial mount call and manual refreshSession() bypasses this.
const PASSIVE_REVALIDATE_COOLDOWN_MS = 60_000;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isValidatingRef = useRef(false);
  const lastPassiveValidationRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateSession = useCallback(async (showLoading = false) => {
    if (isValidatingRef.current) return;
    isValidatingRef.current = true;

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      const data: SessionResponse = await response.json();

      if (response.ok && data.valid && data.user) {
        setUser(data.user);
      } else if (response.status >= 500) {
        // Server error (e.g. during hot reload) — keep the current user state
        // rather than logging out. The cookie is still valid.
      } else {
        setUser(null);
      }
    } catch (error) {
      // Network failure — keep current state, don't log out
      console.error('Session validation error:', error);
    } finally {
      setIsLoading(false);
      isValidatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    validateSession(true);
  }, [validateSession]);

  useEffect(() => {
    // Debounced passive refresh — deduplicates focus + visibilitychange firing together,
    // and enforces a cooldown so rapid tab switches don't hammer the endpoint.
    const schedulePassiveRefresh = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        const now = Date.now();
        if (now - lastPassiveValidationRef.current < PASSIVE_REVALIDATE_COOLDOWN_MS) return;
        lastPassiveValidationRef.current = now;
        void validateSession(false);
      }, 300);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        schedulePassiveRefresh();
      }
    };

    window.addEventListener('focus', schedulePassiveRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', schedulePassiveRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [validateSession]);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      const data: LoginResponse = await response.json();

      if (response.ok && data.success && data.user) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  };

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshSession: validateSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Session Helper
 * Reusable session validation logic for API routes
 */

import { cookies } from 'next/headers';
import { getTeamMemberByEmail } from '@/lib/db/team';
import { AUTH_CONFIG } from '@/constants/auth';
import { RoleName, TeamMemberWithRole } from '@/types/team';
import { resolveSessionFromToken } from './sessionResolver';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  initials: string;
}

export interface SessionValidationResult {
  isValid: boolean;
  user: SessionUser | null;
  teamMember: TeamMemberWithRole | null;
  error: string | null;
  statusCode: number;
  sessionToken: string | null;
  shouldRefreshCookie: boolean;
}

/**
 * Validates the current session and returns the user
 * Use this in API routes for authentication
 */
export async function validateSession(): Promise<SessionValidationResult> {
  try {
    // Get session token from cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(AUTH_CONFIG.SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return {
        isValid: false,
        user: null,
        teamMember: null,
        error: 'Unauthorized',
        statusCode: 401,
        sessionToken: null,
        shouldRefreshCookie: false,
      };
    }

    const resolvedSession = await resolveSessionFromToken(sessionToken, {
      loadTeamMember: async (email) => {
        const { data } = await getTeamMemberByEmail(email);
        return data || null;
      },
      cleanupExpired: true,
      renewIfExpiring: true,
    });

    if (!resolvedSession) {
      return {
        isValid: false,
        user: null,
        teamMember: null,
        error: 'Invalid or expired session',
        statusCode: 401,
        sessionToken: null,
        shouldRefreshCookie: false,
      };
    }

    const user: SessionUser = {
      id: resolvedSession.user.id,
      email: resolvedSession.user.email,
      name: resolvedSession.user.name,
      role: resolvedSession.user.role as RoleName,
      initials: resolvedSession.user.initials,
    };

    return {
      isValid: true,
      user,
      teamMember: resolvedSession.teamMember,
      error: null,
      statusCode: 200,
      sessionToken,
      shouldRefreshCookie: resolvedSession.renewed,
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return {
      isValid: false,
      user: null,
      teamMember: null,
      error: 'Internal server error',
      statusCode: 500,
      sessionToken: null,
      shouldRefreshCookie: false,
    };
  }
}

/**
 * Quick session check - just validates without fetching full team member
 */
export async function quickSessionCheck(): Promise<{
  isValid: boolean;
  user: SessionUser | null;
  error: string | null;
}> {
  const result = await validateSession();
  return {
    isValid: result.isValid,
    user: result.user,
    error: result.error,
  };
}

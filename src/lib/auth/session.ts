/**
 * Session Helper
 * Reusable session validation logic for API routes
 */

import { cookies } from 'next/headers';
import { findSessionByToken, isSessionExpired } from '@/lib/db/auth';
import { getTeamMemberByEmail } from '@/lib/db/team';
import { AUTH_CONFIG } from '@/constants/auth';
import { RoleName, TeamMemberWithRole } from '@/types/team';

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
      };
    }

    // Find session with user data
    const { data: session, error: sessionError } = await findSessionByToken(sessionToken);

    if (sessionError || !session || isSessionExpired(session.expires_at)) {
      return {
        isValid: false,
        user: null,
        teamMember: null,
        error: 'Invalid or expired session',
        statusCode: 401,
      };
    }

    // Get user from session (team_member or legacy admin)
    const userEmail = session.team_member?.email || session.admin?.email;
    const userRole = session.team_member?.role?.name || session.admin?.role;

    if (!userEmail || !userRole) {
      return {
        isValid: false,
        user: null,
        teamMember: null,
        error: 'Invalid session',
        statusCode: 401,
      };
    }

    // Get full team member record
    const { data: teamMember } = await getTeamMemberByEmail(userEmail);

    // Build session user object
    const user: SessionUser = {
      id: session.team_member?.id || session.admin?.id || '',
      email: userEmail,
      name: session.team_member?.name || session.admin?.name || '',
      role: userRole as RoleName,
      initials: session.team_member?.initials || session.admin?.initials || '',
    };

    return {
      isValid: true,
      user,
      teamMember: teamMember || null,
      error: null,
      statusCode: 200,
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return {
      isValid: false,
      user: null,
      teamMember: null,
      error: 'Internal server error',
      statusCode: 500,
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

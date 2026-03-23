/**
 * API Route Helpers
 *
 * Higher-order functions to wrap API routes with authentication and authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, SessionUser, SessionValidationResult } from './session';
import { canAccessRoute, hasRoleAccess } from './rbac';
import { RoleName } from '@/types/team';
import { TeamMemberWithRole } from '@/types/team';
import { setAuthCookie } from '@/lib/api/cookies';

/**
 * Context passed to authenticated route handlers
 */
export interface AuthContext {
  user: SessionUser;
  teamMember: TeamMemberWithRole | null;
}

/**
 * Route handler type with auth context
 */
type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext,
  params?: any
) => Promise<NextResponse>;

/**
 * Higher-order function to wrap API routes with authentication
 *
 * Usage:
 * ```typescript
 * export const GET = withAuth(async (request, { user, teamMember }) => {
 *   // user is guaranteed to be authenticated
 *   return NextResponse.json({ success: true, user });
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeParams?: { params: Promise<any> }) => {
    const session = await validateSession();

    if (!session.isValid || !session.user) {
      return NextResponse.json(
        { success: false, error: session.error },
        { status: session.statusCode }
      );
    }

    const params = routeParams?.params ? await routeParams.params : undefined;

    const response = await handler(request, {
      user: session.user,
      teamMember: session.teamMember,
    }, params);

    if (session.shouldRefreshCookie && session.sessionToken) {
      setAuthCookie(response, session.sessionToken);
    }

    return response;
  };
}

/**
 * Higher-order function to wrap API routes with role-based authentication
 *
 * Usage:
 * ```typescript
 * export const GET = withRoleAuth(['Administrator', 'Team Lead'], async (request, { user }) => {
 *   // user is guaranteed to be Admin or Team Lead
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withRoleAuth(allowedRoles: RoleName[], handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeParams?: { params: Promise<any> }) => {
    const session = await validateSession();

    if (!session.isValid || !session.user) {
      return NextResponse.json(
        { success: false, error: session.error },
        { status: session.statusCode }
      );
    }

    // Check role permission
    if (!hasRoleAccess(session.user.role, allowedRoles)) {
      return NextResponse.json(
        {
          success: false,
          error: `Access denied. Required roles: ${allowedRoles.join(', ')}`
        },
        { status: 403 }
      );
    }

    const params = routeParams?.params ? await routeParams.params : undefined;

    const response = await handler(request, {
      user: session.user,
      teamMember: session.teamMember,
    }, params);

    if (session.shouldRefreshCookie && session.sessionToken) {
      setAuthCookie(response, session.sessionToken);
    }

    return response;
  };
}

/**
 * Check if request is from an admin
 */
export function isAdmin(user: SessionUser): boolean {
  return user.role === 'Administrator';
}

/**
 * Check if request is from a team lead or higher
 */
export function isTeamLeadOrHigher(user: SessionUser): boolean {
  return user.role === 'Administrator' || user.role === 'Team Lead';
}

/**
 * Standard error responses
 */
export const AuthErrors = {
  unauthorized: () =>
    NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),

  forbidden: (message?: string) =>
    NextResponse.json(
      { success: false, error: message || 'Access denied' },
      { status: 403 }
    ),

  invalidSession: () =>
    NextResponse.json(
      { success: false, error: 'Invalid or expired session' },
      { status: 401 }
    ),
};

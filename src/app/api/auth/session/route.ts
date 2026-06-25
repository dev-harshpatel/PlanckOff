/**
 * GET /api/auth/session
 * Validates the current session and returns user data
 */

import { NextRequest, NextResponse } from 'next/server';
import { SessionResponse } from '@/types/auth';
import { getSessionToken } from '@/lib/api/cookies';
import { clearAuthCookie, setAuthCookie } from '@/lib/api/cookies';
import { resolveSessionFromToken } from '@/lib/auth/sessionResolver';
import { HTTP_STATUS } from '@/lib/api/response';
import { AUTH_ERRORS } from '@/constants/auth';

// Response for invalid/missing session
const INVALID_SESSION: SessionResponse = {
  valid: false,
  error: AUTH_ERRORS.SESSION_INVALID,
  code: 'SESSION_INVALID',
};

const invalidSessionResponse = () => {
  const response = NextResponse.json<SessionResponse>(INVALID_SESSION, {
    status: HTTP_STATUS.UNAUTHORIZED,
  });
  clearAuthCookie(response);
  return response;
};

export async function GET(request: NextRequest) {
  try {
    // 1. Get token from cookie
    const token = getSessionToken(request.cookies);

    if (!token) {
      return invalidSessionResponse();
    }

    const resolvedSession = await resolveSessionFromToken(token, {
      cleanupExpired: true,
      renewIfExpiring: true,
    });

    if (!resolvedSession) {
      return invalidSessionResponse();
    }

    const response = NextResponse.json<SessionResponse>({
      valid: true,
      user: resolvedSession.user,
    });

    if (resolvedSession.renewed) {
      setAuthCookie(response, token);
    }

    return response;
  } catch (error) {
    // Re-throw Next.js's build-time dynamic server usage signal so it correctly
    // marks this route as dynamic without logging a false error.
    if (
      error instanceof Error &&
      (error as Error & { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
    ) {
      throw error;
    }
    // Server error (e.g. Supabase unavailable during hot reload) — do NOT clear the
    // cookie. The session may still be valid; we just can't verify it right now.
    console.error('Session validation error:', error);
    return NextResponse.json<SessionResponse>(
      { valid: false, error: AUTH_ERRORS.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
      { status: HTTP_STATUS.INTERNAL_ERROR },
    );
  }
}

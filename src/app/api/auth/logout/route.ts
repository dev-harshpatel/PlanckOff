/**
 * POST /api/auth/logout
 * Destroys the current session and clears the cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteSessionByToken } from '@/lib/db/auth';
import { getSessionToken, clearAuthCookie } from '@/lib/api/cookies';
import { HTTP_STATUS } from '@/lib/api/response';
import { AUTH_ERRORS } from '@/constants/auth';

export async function POST(request: NextRequest) {
  try {
    // 1. Get token from cookie
    const token = getSessionToken(request.cookies);

    // 2. Delete session from database (if token exists)
    if (token) {
      await deleteSessionByToken(token);
    }

    // 3. Clear cookie and return success
    const response = NextResponse.json({ success: true });
    clearAuthCookie(response);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: AUTH_ERRORS.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_ERROR }
    );
  }
}

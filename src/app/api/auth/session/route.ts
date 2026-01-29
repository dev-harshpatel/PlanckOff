/**
 * GET /api/auth/session
 * Validates the current session and returns user data
 */

import { NextRequest, NextResponse } from 'next/server';
import { Admin, SessionResponse } from '@/types/auth';
import { findSessionByToken, deleteSessionById, isSessionExpired } from '@/lib/db/auth';
import { getSessionToken } from '@/lib/api/cookies';

// Response for invalid/missing session
const INVALID_SESSION: SessionResponse = { valid: false };

export async function GET(request: NextRequest) {
  try {
    // 1. Get token from cookie
    const token = getSessionToken(request.cookies);

    if (!token) {
      return NextResponse.json<SessionResponse>(INVALID_SESSION);
    }

    // 2. Find session with admin data (JOIN query)
    const { data: session, error } = await findSessionByToken(token);

    if (error || !session) {
      return NextResponse.json<SessionResponse>(INVALID_SESSION);
    }

    // 3. Check expiration
    if (isSessionExpired(session.expires_at)) {
      // Clean up expired session in background
      await deleteSessionById(session.id);
      return NextResponse.json<SessionResponse>(INVALID_SESSION);
    }

    // 4. Validate admin data exists
    if (!session.admin) {
      return NextResponse.json<SessionResponse>(INVALID_SESSION);
    }

    // 5. Return user data
    const user: Admin = {
      id: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      role: session.admin.role,
      initials: session.admin.initials || session.admin.name.charAt(0).toUpperCase(),
    };

    return NextResponse.json<SessionResponse>({ valid: true, user });
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json<SessionResponse>(INVALID_SESSION);
  }
}

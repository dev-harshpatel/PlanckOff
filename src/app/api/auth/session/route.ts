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

    // 2. Find session with admin/team_member data (JOIN query)
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

    // 4. Check for team_member first (new system), then admin (legacy)
    if (session.team_member) {
      const user: Admin = {
        id: session.team_member.id,
        email: session.team_member.email,
        name: session.team_member.name,
        role: session.team_member.role?.name || 'Estimator',
        initials: session.team_member.initials || session.team_member.name.charAt(0).toUpperCase(),
      };
      return NextResponse.json<SessionResponse>({ valid: true, user });
    }

    // 5. Fallback to admin data (legacy)
    if (session.admin) {
      const user: Admin = {
        id: session.admin.id,
        email: session.admin.email,
        name: session.admin.name,
        role: session.admin.role,
        initials: session.admin.initials || session.admin.name.charAt(0).toUpperCase(),
      };
      return NextResponse.json<SessionResponse>({ valid: true, user });
    }

    // No user data found
    return NextResponse.json<SessionResponse>(INVALID_SESSION);
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json<SessionResponse>(INVALID_SESSION);
  }
}

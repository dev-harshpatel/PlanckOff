/**
 * POST /api/auth/login
 * Authenticates a user and creates a session
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Admin, LoginResponse } from '@/types/auth';
import { AUTH_ERRORS, DB_ERROR_CODES } from '@/constants/auth';
import { findAdminByEmail, createSession, createTeamMemberSession } from '@/lib/db/auth';
import { getTeamMemberByEmailForAuth } from '@/lib/db/team';
import { getClientIp, getUserAgent, HTTP_STATUS } from '@/lib/api/response';
import { setAuthCookie } from '@/lib/api/cookies';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate input
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: AUTH_ERRORS.MISSING_CREDENTIALS },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    // 2. First try to find user in team_members table (new system)
    const { data: teamMember } = await getTeamMemberByEmailForAuth(email);

    if (teamMember && teamMember.password_hash) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, teamMember.password_hash);

      if (!isValidPassword) {
        return NextResponse.json<LoginResponse>(
          { success: false, error: AUTH_ERRORS.INVALID_CREDENTIALS },
          { status: HTTP_STATUS.UNAUTHORIZED }
        );
      }

      // Check if user is active
      if (teamMember.status !== 'Active') {
        return NextResponse.json<LoginResponse>(
          { success: false, error: 'Your account is not active. Please contact an administrator.' },
          { status: HTTP_STATUS.UNAUTHORIZED }
        );
      }

      // Create session for team member
      const { data: session, error: sessionError } = await createTeamMemberSession({
        teamMemberId: teamMember.id,
        ipAddress: getClientIp(request.headers),
        userAgent: getUserAgent(request.headers),
      });

      if (sessionError || !session) {
        console.error('Session creation error:', sessionError);
        return NextResponse.json<LoginResponse>(
          { success: false, error: AUTH_ERRORS.SESSION_CREATION_FAILED },
          { status: HTTP_STATUS.INTERNAL_ERROR }
        );
      }

      // Prepare user response
      const user: Admin = {
        id: teamMember.id,
        email: teamMember.email,
        name: teamMember.name,
        role: teamMember.role.name,
        initials: teamMember.initials || teamMember.name.charAt(0).toUpperCase(),
      };

      const response = NextResponse.json<LoginResponse>({ success: true, user });
      setAuthCookie(response, session.token);

      return response;
    }

    // 3. Fallback to admins table (legacy system)
    const { data: admin, error: fetchError } = await findAdminByEmail(email);

    if (fetchError) {
      console.error('Database error:', fetchError.message, fetchError.code);

      if (fetchError.code === DB_ERROR_CODES.TABLE_NOT_FOUND) {
        return NextResponse.json<LoginResponse>(
          { success: false, error: AUTH_ERRORS.DATABASE_NOT_CONFIGURED },
          { status: HTTP_STATUS.INTERNAL_ERROR }
        );
      }
    }

    if (!admin) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: AUTH_ERRORS.INVALID_CREDENTIALS },
        { status: HTTP_STATUS.UNAUTHORIZED }
      );
    }

    // 4. Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);

    if (!isValidPassword) {
      return NextResponse.json<LoginResponse>(
        { success: false, error: AUTH_ERRORS.INVALID_CREDENTIALS },
        { status: HTTP_STATUS.UNAUTHORIZED }
      );
    }

    // 5. Create session
    const { data: session, error: sessionError } = await createSession({
      adminId: admin.id,
      ipAddress: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });

    if (sessionError || !session) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json<LoginResponse>(
        { success: false, error: AUTH_ERRORS.SESSION_CREATION_FAILED },
        { status: HTTP_STATUS.INTERNAL_ERROR }
      );
    }

    // 6. Prepare user response (exclude sensitive data)
    const user: Admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      initials: admin.initials || admin.name.charAt(0).toUpperCase(),
    };

    // 7. Return response with httpOnly cookie
    const response = NextResponse.json<LoginResponse>({ success: true, user });
    setAuthCookie(response, session.token);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<LoginResponse>(
      { success: false, error: AUTH_ERRORS.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_ERROR }
    );
  }
}

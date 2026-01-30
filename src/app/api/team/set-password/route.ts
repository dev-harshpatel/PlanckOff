/**
 * POST /api/team/set-password
 * Set password for invited user and create their account
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  getInvitationByToken,
  isInvitationValid,
  markInvitationAsUsed,
  createTeamMember,
  getTeamMemberById,
} from '@/lib/db/team';
import { validatePassword } from '@/constants/roles';
import { AUTH_CONFIG } from '@/constants/auth';
import { SetPasswordRequest, SetPasswordResponse } from '@/types/team';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: SetPasswordRequest = await request.json();
    const { token, password } = body;

    // Validate required fields
    if (!token || !password) {
      const response: SetPasswordResponse = {
        success: false,
        error: 'Token and password are required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate password requirements
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      const response: SetPasswordResponse = {
        success: false,
        error: passwordValidation.errors.join('. '),
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Get invitation by token
    const { data: invitation, error: inviteError } = await getInvitationByToken(token);

    if (inviteError || !invitation) {
      const response: SetPasswordResponse = {
        success: false,
        error: 'Invalid invitation token',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Check if invitation is still valid
    if (!isInvitationValid(invitation)) {
      const response: SetPasswordResponse = {
        success: false,
        error: invitation.used_at
          ? 'This invitation has already been used'
          : 'This invitation has expired',
      };
      return NextResponse.json(response, { status: 410 });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

    // Determine who the user reports to
    let reportsTo: string | undefined = undefined;

    // If invited by someone, and the new user is an Estimator, they report to the inviter (if Team Lead)
    // Or find an appropriate Team Lead
    if (invitation.invited_by) {
      const { data: inviter } = await getTeamMemberById(invitation.invited_by);
      if (inviter) {
        // Estimators report to Team Leads
        if (invitation.role.name === 'Estimator' && inviter.role.name === 'Team Lead') {
          reportsTo = inviter.id;
        }
        // Team Leads report to Administrators
        else if (invitation.role.name === 'Team Lead' && inviter.role.name === 'Administrator') {
          reportsTo = inviter.id;
        }
      }
    }

    // Create the team member
    const { data: newMember, error: createError } = await createTeamMember({
      email: invitation.email,
      name: invitation.name,
      password_hash: passwordHash,
      role_id: invitation.role_id,
      invited_by: invitation.invited_by || undefined,
      reports_to: reportsTo,
    });

    if (createError || !newMember) {
      console.error('Failed to create team member:', createError);

      // Check if user already exists
      if (createError?.code === '23505') {
        const response: SetPasswordResponse = {
          success: false,
          error: 'An account with this email already exists',
        };
        return NextResponse.json(response, { status: 409 });
      }

      const response: SetPasswordResponse = {
        success: false,
        error: 'Failed to create account. Please try again.',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Mark invitation as used
    const { error: markError } = await markInvitationAsUsed(token);
    if (markError) {
      console.error('Failed to mark invitation as used:', markError);
      // Don't fail the request - account is created
    }

    const response: SetPasswordResponse = {
      success: true,
      message: 'Account created successfully. You can now log in.',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Set password error:', error);
    const response: SetPasswordResponse = {
      success: false,
      error: 'Internal server error',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

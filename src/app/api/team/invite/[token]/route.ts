/**
 * GET /api/team/invite/[token]
 * Validate invitation token
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredInvitations, getInvitationByToken, isInvitationValid } from '@/lib/db/team';
import { ValidateInvitationResponse, RoleName } from '@/types/team';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    await cleanupExpiredInvitations();

    if (!token) {
      const response: ValidateInvitationResponse = {
        valid: false,
        error: 'Token is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Get invitation by token
    const { data: invitation, error } = await getInvitationByToken(token);

    if (error || !invitation) {
      const response: ValidateInvitationResponse = {
        valid: false,
        error: 'Invalid invitation token',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Check if invitation is still valid
    if (!isInvitationValid(invitation)) {
      const response: ValidateInvitationResponse = {
        valid: false,
        error: invitation.used_at
          ? 'This invitation has already been used'
          : 'This invitation has expired',
      };
      return NextResponse.json(response, { status: 410 });
    }

    // Return valid invitation details
    const response: ValidateInvitationResponse = {
      valid: true,
      invitation: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role.name as RoleName,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Validate invitation error:', error);
    const response: ValidateInvitationResponse = {
      valid: false,
      error: 'Internal server error',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

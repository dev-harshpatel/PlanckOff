/**
 * Team Member Role API
 * PUT /api/team/members/[id]/role - Change member's role (promote/demote)
 *
 * Admin only
 */

import { NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth';
import { changeMemberRole } from '@/lib/db/roles';
import { getTeamMemberById } from '@/lib/db/team';
import { ChangeMemberRoleRequest } from '@/types/permissions';

/**
 * PUT /api/team/members/[id]/role
 * Change a team member's role (promote/demote)
 */
export const PUT = withRoleAuth(
  ['Administrator'],
  async (request, context, params) => {
    try {
      const { id } = params;

      // Parse request body
      const body: ChangeMemberRoleRequest = await request.json();
      const { roleId } = body;

      if (!roleId) {
        return NextResponse.json(
          { success: false, error: 'Role ID is required' },
          { status: 400 }
        );
      }

      // Verify member exists
      const { data: member, error: memberError } = await getTeamMemberById(id);

      if (memberError || !member) {
        return NextResponse.json(
          { success: false, error: 'Team member not found' },
          { status: 404 }
        );
      }

      // Change the member's role
      const { error: updateError } = await changeMemberRole(id, roleId);

      if (updateError) {
        console.error('Failed to change member role:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to change member role' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Member role updated successfully',
      });
    } catch (error) {
      console.error('Change member role error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

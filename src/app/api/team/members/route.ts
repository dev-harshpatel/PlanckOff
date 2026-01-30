/**
 * GET /api/team/members
 * Get all team members
 * Only accessible by Administrators and Team Leads
 */

import { NextResponse } from 'next/server';
import { getAllTeamMembers } from '@/lib/db/team';
import { withRoleAuth } from '@/lib/auth';
import { TeamMembersResponse } from '@/types/team';

export const GET = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request, { user }) => {
    try {
      // Get all team members
      const { data: members, error: membersError } = await getAllTeamMembers();

      if (membersError) {
        console.error('Failed to fetch team members:', membersError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch team members' },
          { status: 500 }
        );
      }

      const response: TeamMembersResponse = {
        success: true,
        members: members || [],
      };

      return NextResponse.json(response);
    } catch (error) {
      console.error('Get team members error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

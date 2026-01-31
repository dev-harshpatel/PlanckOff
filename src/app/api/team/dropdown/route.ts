/**
 * GET /api/team/dropdown
 * Get team members for dropdown selection
 * Accessible by all authenticated users (not role-restricted)
 * Returns a simplified list of active team members
 */

import { NextResponse } from 'next/server';
import { getAllTeamMembers } from '@/lib/db/team';
import { withAuth } from '@/lib/auth';

export interface TeamMemberDropdownItem {
  id: string;
  name: string;
  role: string;
}

export interface TeamDropdownResponse {
  success: boolean;
  members?: TeamMemberDropdownItem[];
  error?: string;
}

export const GET = withAuth(async (request, { user }) => {
  try {
    const { data: members, error } = await getAllTeamMembers();

    if (error) {
      console.error('Failed to fetch team members:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch team members' },
        { status: 500 }
      );
    }

    // Filter active members and transform to dropdown format
    const dropdownMembers: TeamMemberDropdownItem[] = (members || [])
      .filter(member => member.status === 'Active')
      .map(member => ({
        id: member.id,
        name: member.name,
        role: member.role?.name || 'Unknown',
      }));

    const response: TeamDropdownResponse = {
      success: true,
      members: dropdownMembers,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get team dropdown error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

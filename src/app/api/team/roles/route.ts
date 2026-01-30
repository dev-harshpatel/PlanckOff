/**
 * GET /api/team/roles
 * Get all available roles
 * Only accessible by Administrators and Team Leads
 */

import { NextResponse } from 'next/server';
import { getAllRoles } from '@/lib/db/team';
import { withRoleAuth } from '@/lib/auth';

export const GET = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async () => {
    try {
      const { data: roles, error } = await getAllRoles();

      if (error) {
        console.error('Failed to fetch roles:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch roles' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        roles: roles || [],
      });
    } catch (error) {
      console.error('Get roles error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

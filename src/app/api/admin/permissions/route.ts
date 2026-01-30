/**
 * Admin Permissions API
 * GET /api/admin/permissions - List all permissions
 *
 * Admin only
 */

import { NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth';
import { getAllPermissions, getPermissionsGrouped } from '@/lib/db/roles';
import { PermissionsListResponse } from '@/types/permissions';

/**
 * GET /api/admin/permissions
 * List all permissions, optionally grouped by category
 */
export const GET = withRoleAuth(
  ['Administrator'],
  async (request) => {
    try {
      const { searchParams } = new URL(request.url);
      const grouped = searchParams.get('grouped') === 'true';

      if (grouped) {
        // Return permissions grouped by category
        const { data: groupedPermissions, error } = await getPermissionsGrouped();

        if (error) {
          console.error('Failed to fetch grouped permissions:', error);
          return NextResponse.json<PermissionsListResponse>(
            { success: false, error: 'Failed to fetch permissions' },
            { status: 500 }
          );
        }

        return NextResponse.json<PermissionsListResponse>({
          success: true,
          grouped: groupedPermissions || [],
        });
      } else {
        // Return flat list of all permissions
        const { data: permissions, error } = await getAllPermissions();

        if (error) {
          console.error('Failed to fetch permissions:', error);
          return NextResponse.json<PermissionsListResponse>(
            { success: false, error: 'Failed to fetch permissions' },
            { status: 500 }
          );
        }

        return NextResponse.json<PermissionsListResponse>({
          success: true,
          permissions: permissions || [],
        });
      }
    } catch (error) {
      console.error('Get permissions error:', error);
      return NextResponse.json<PermissionsListResponse>(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

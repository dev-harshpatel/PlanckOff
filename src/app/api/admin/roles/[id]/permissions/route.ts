/**
 * Admin Role Permissions API
 * PUT /api/admin/roles/[id]/permissions - Update role permissions
 *
 * Admin only
 */

import { NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth';
import {
  getRoleWithPermissions,
  updateRolePermissions,
} from '@/lib/db/roles';
import { UpdateRolePermissionsRequest } from '@/types/permissions';

/**
 * PUT /api/admin/roles/[id]/permissions
 * Update all permissions for a role (replace)
 */
export const PUT = withRoleAuth(
  ['Administrator'],
  async (request, context, params) => {
    try {
      const { id } = params;

      // Check if role exists
      const { data: role, error: fetchError } = await getRoleWithPermissions(id);

      if (fetchError || !role) {
        return NextResponse.json(
          { success: false, error: 'Role not found' },
          { status: 404 }
        );
      }

      // Parse request body
      const body: UpdateRolePermissionsRequest = await request.json();
      const { permissionIds } = body;

      if (!Array.isArray(permissionIds)) {
        return NextResponse.json(
          { success: false, error: 'permissionIds must be an array' },
          { status: 400 }
        );
      }

      // Update permissions
      const { error: updateError } = await updateRolePermissions(id, permissionIds);

      if (updateError) {
        console.error('Failed to update role permissions:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to update permissions' },
          { status: 500 }
        );
      }

      // Fetch updated role
      const { data: updatedRole } = await getRoleWithPermissions(id);

      return NextResponse.json({
        success: true,
        message: 'Permissions updated successfully',
        role: updatedRole,
      });
    } catch (error) {
      console.error('Update role permissions error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

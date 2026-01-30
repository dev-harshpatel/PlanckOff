/**
 * Admin Single Role API
 * GET /api/admin/roles/[id] - Get role details
 * PUT /api/admin/roles/[id] - Update role
 * DELETE /api/admin/roles/[id] - Delete role
 *
 * Admin only
 */

import { NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth';
import {
  getRoleWithPermissions,
  updateRole,
  deleteRole,
  isProtectedRole,
} from '@/lib/db/roles';
import { UpdateRoleRequest, RoleResponse } from '@/types/permissions';

/**
 * GET /api/admin/roles/[id]
 * Get role details with permissions
 */
export const GET = withRoleAuth(
  ['Administrator'],
  async (request, context, params) => {
    try {
      const { id } = params;

      const { data: role, error } = await getRoleWithPermissions(id);

      if (error || !role) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Role not found' },
          { status: 404 }
        );
      }

      return NextResponse.json<RoleResponse>({
        success: true,
        role,
      });
    } catch (error) {
      console.error('Get role error:', error);
      return NextResponse.json<RoleResponse>(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/admin/roles/[id]
 * Update role details (name, level, description)
 */
export const PUT = withRoleAuth(
  ['Administrator'],
  async (request, context, params) => {
    try {
      const { id } = params;

      // Check if role exists
      const { data: existingRole, error: fetchError } = await getRoleWithPermissions(id);

      if (fetchError || !existingRole) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Role not found' },
          { status: 404 }
        );
      }

      // Parse request body
      const body: UpdateRoleRequest = await request.json();
      const { name, level, description } = body;

      // Build updates object
      const updates: { name?: string; level?: number; description?: string } = {};

      if (name !== undefined) {
        if (name.length < 2 || name.length > 50) {
          return NextResponse.json<RoleResponse>(
            { success: false, error: 'Role name must be between 2 and 50 characters' },
            { status: 400 }
          );
        }
        updates.name = name;
      }

      if (level !== undefined) {
        if (level < 1 || level > 100) {
          return NextResponse.json<RoleResponse>(
            { success: false, error: 'Level must be between 1 and 100' },
            { status: 400 }
          );
        }
        updates.level = level;
      }

      if (description !== undefined) {
        updates.description = description;
      }

      // Prevent changing protected role names
      if (updates.name && isProtectedRole(existingRole.name) && updates.name !== existingRole.name) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Cannot rename protected roles (Administrator, Team Lead, Estimator)' },
          { status: 403 }
        );
      }

      // Update the role
      const { data: updatedRole, error: updateError } = await updateRole(id, updates);

      if (updateError) {
        console.error('Failed to update role:', updateError);

        if (updateError.code === '23505') {
          return NextResponse.json<RoleResponse>(
            { success: false, error: 'A role with this name already exists' },
            { status: 409 }
          );
        }

        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Failed to update role' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Role updated successfully',
        role: updatedRole,
      });
    } catch (error) {
      console.error('Update role error:', error);
      return NextResponse.json<RoleResponse>(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/admin/roles/[id]
 * Delete a role
 */
export const DELETE = withRoleAuth(
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

      // Prevent deleting protected roles
      if (isProtectedRole(role.name)) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete protected roles (Administrator, Team Lead, Estimator)' },
          { status: 403 }
        );
      }

      // Delete the role
      const { error: deleteError } = await deleteRole(id);

      if (deleteError) {
        console.error('Failed to delete role:', deleteError);

        if (deleteError.code === 'ROLE_HAS_MEMBERS') {
          return NextResponse.json(
            { success: false, error: deleteError.message },
            { status: 400 }
          );
        }

        return NextResponse.json(
          { success: false, error: 'Failed to delete role' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      console.error('Delete role error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

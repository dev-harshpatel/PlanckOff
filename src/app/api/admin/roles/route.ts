/**
 * Admin Roles API
 * GET /api/admin/roles - List all roles with permissions
 * POST /api/admin/roles - Create new role
 *
 * Admin only
 */

import { NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth';
import { getAllRolesWithPermissions, createRole } from '@/lib/db/roles';
import { CreateRoleRequest, RolesListResponse, RoleResponse } from '@/types/permissions';

/**
 * GET /api/admin/roles
 * List all roles with their permissions
 */
export const GET = withRoleAuth(
  ['Administrator'],
  async () => {
    try {
      const { data: roles, error } = await getAllRolesWithPermissions();

      if (error) {
        console.error('Failed to fetch roles:', error);
        return NextResponse.json<RolesListResponse>(
          { success: false, error: 'Failed to fetch roles' },
          { status: 500 }
        );
      }

      return NextResponse.json<RolesListResponse>({
        success: true,
        roles: roles || [],
      });
    } catch (error) {
      console.error('Get roles error:', error);
      return NextResponse.json<RolesListResponse>(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/admin/roles
 * Create a new role
 */
export const POST = withRoleAuth(
  ['Administrator'],
  async (request) => {
    try {
      const body: CreateRoleRequest = await request.json();
      const { name, level, description, permissionIds } = body;

      // Validate required fields
      if (!name || level === undefined) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Name and level are required' },
          { status: 400 }
        );
      }

      // Validate name length
      if (name.length < 2 || name.length > 50) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Role name must be between 2 and 50 characters' },
          { status: 400 }
        );
      }

      // Validate level
      if (level < 1 || level > 100) {
        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Level must be between 1 and 100' },
          { status: 400 }
        );
      }

      // Create the role
      const { data: role, error } = await createRole({
        name,
        level,
        description,
        permissionIds,
      });

      if (error) {
        console.error('Failed to create role:', error);

        // Check for duplicate name
        if (error.code === '23505') {
          return NextResponse.json<RoleResponse>(
            { success: false, error: 'A role with this name already exists' },
            { status: 409 }
          );
        }

        return NextResponse.json<RoleResponse>(
          { success: false, error: 'Failed to create role' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Role created successfully',
        role,
      });
    } catch (error) {
      console.error('Create role error:', error);
      return NextResponse.json<RoleResponse>(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

/**
 * Roles & Permissions Repository
 *
 * Database operations for role and permission management
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import {
  Permission,
  RoleWithPermissions,
  GroupedPermissions,
  PermissionCategory,
} from '@/types/permissions';
import { Role } from '@/types/team';

// ==================== PERMISSIONS ====================

/**
 * Get all permissions
 */
export async function getAllPermissions(): Promise<{
  data: Permission[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('permissions')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  return { data, error };
}

/**
 * Get permissions grouped by category
 */
export async function getPermissionsGrouped(): Promise<{
  data: GroupedPermissions[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data: permissions, error } = await getAllPermissions();

  if (error || !permissions) {
    return { data: null, error };
  }

  // Group by category
  const grouped = permissions.reduce((acc, perm) => {
    const existing = acc.find(g => g.category === perm.category);
    if (existing) {
      existing.permissions.push(perm);
    } else {
      acc.push({
        category: perm.category as PermissionCategory,
        permissions: [perm],
      });
    }
    return acc;
  }, [] as GroupedPermissions[]);

  return { data: grouped, error: null };
}

/**
 * Get permission by code
 */
export async function getPermissionByCode(code: string): Promise<{
  data: Permission | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('permissions')
    .select('*')
    .eq('code', code)
    .single();

  return { data, error };
}

// ==================== ROLES WITH PERMISSIONS ====================

/**
 * Get all roles with their permissions and member counts
 */
export async function getAllRolesWithPermissions(): Promise<{
  data: RoleWithPermissions[] | null;
  error: { message: string; code: string } | null;
}> {
  // Get roles with permissions
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('roles')
    .select(`
      id,
      name,
      level,
      description,
      created_at,
      role_permissions (
        permissions (
          id,
          code,
          name,
          description,
          category,
          created_at
        )
      )
    `)
    .order('level', { ascending: true });

  if (rolesError) {
    return { data: null, error: rolesError };
  }

  // Get member counts per role
  const { data: memberCounts, error: countError } = await supabaseAdmin
    .from('team_members')
    .select('role_id')
    .not('role_id', 'is', null);

  if (countError) {
    console.error('Failed to get member counts:', countError);
  }

  // Count members per role
  const countMap = new Map<string, number>();
  if (memberCounts) {
    memberCounts.forEach(m => {
      const count = countMap.get(m.role_id) || 0;
      countMap.set(m.role_id, count + 1);
    });
  }

  // Transform data
  const transformedRoles = roles?.map(role => ({
    id: role.id,
    name: role.name,
    level: role.level,
    description: role.description,
    created_at: role.created_at,
    permissions: (role.role_permissions as any[])?.map(rp => rp.permissions).filter(Boolean) || [],
    memberCount: countMap.get(role.id) || 0,
  })) as RoleWithPermissions[];

  return { data: transformedRoles, error: null };
}

/**
 * Get single role with permissions
 */
export async function getRoleWithPermissions(roleId: string): Promise<{
  data: RoleWithPermissions | null;
  error: { message: string; code: string } | null;
}> {
  const { data: role, error } = await supabaseAdmin
    .from('roles')
    .select(`
      id,
      name,
      level,
      description,
      created_at,
      role_permissions (
        permissions (
          id,
          code,
          name,
          description,
          category,
          created_at
        )
      )
    `)
    .eq('id', roleId)
    .single();

  if (error) {
    return { data: null, error };
  }

  // Get member count
  const { count } = await supabaseAdmin
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', roleId);

  const transformed: RoleWithPermissions = {
    id: role.id,
    name: role.name,
    level: role.level,
    description: role.description,
    created_at: role.created_at,
    permissions: (role.role_permissions as any[])?.map(rp => rp.permissions).filter(Boolean) || [],
    memberCount: count || 0,
  };

  return { data: transformed, error: null };
}

/**
 * Create a new role
 */
export async function createRole(params: {
  name: string;
  level: number;
  description?: string;
  permissionIds?: string[];
}): Promise<{
  data: Role | null;
  error: { message: string; code: string } | null;
}> {
  const { name, level, description, permissionIds } = params;

  // Create role
  const { data: role, error: roleError } = await supabaseAdmin
    .from('roles')
    .insert({
      name,
      level,
      description: description || null,
    })
    .select('*')
    .single();

  if (roleError || !role) {
    return { data: null, error: roleError };
  }

  // Add permissions if provided
  if (permissionIds && permissionIds.length > 0) {
    const rolePermissions = permissionIds.map(permId => ({
      role_id: role.id,
      permission_id: permId,
    }));

    const { error: permError } = await supabaseAdmin
      .from('role_permissions')
      .insert(rolePermissions);

    if (permError) {
      console.error('Failed to add permissions to role:', permError);
    }
  }

  return { data: role, error: null };
}

/**
 * Update role details
 */
export async function updateRole(
  roleId: string,
  updates: {
    name?: string;
    level?: number;
    description?: string;
  }
): Promise<{
  data: Role | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('roles')
    .update(updates)
    .eq('id', roleId)
    .select('*')
    .single();

  return { data, error };
}

/**
 * Delete a role
 */
export async function deleteRole(roleId: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  // Check if role has members
  const { count } = await supabaseAdmin
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', roleId);

  if (count && count > 0) {
    return {
      error: {
        message: 'Cannot delete role with assigned members. Reassign members first.',
        code: 'ROLE_HAS_MEMBERS',
      },
    };
  }

  // Delete role (cascade will remove role_permissions)
  const { error } = await supabaseAdmin
    .from('roles')
    .delete()
    .eq('id', roleId);

  return { error };
}

/**
 * Update role permissions (replace all)
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<{
  error: { message: string; code: string } | null;
}> {
  // Delete existing permissions
  const { error: deleteError } = await supabaseAdmin
    .from('role_permissions')
    .delete()
    .eq('role_id', roleId);

  if (deleteError) {
    return { error: deleteError };
  }

  // Add new permissions
  if (permissionIds.length > 0) {
    const rolePermissions = permissionIds.map(permId => ({
      role_id: roleId,
      permission_id: permId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('role_permissions')
      .insert(rolePermissions);

    if (insertError) {
      return { error: insertError };
    }
  }

  return { error: null };
}

/**
 * Get permissions for a role
 */
export async function getRolePermissions(roleId: string): Promise<{
  data: Permission[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('role_permissions')
    .select(`
      permissions (
        id,
        code,
        name,
        description,
        category,
        created_at
      )
    `)
    .eq('role_id', roleId);

  if (error) {
    return { data: null, error };
  }

  const permissions = data?.map((rp: any) => rp.permissions).filter(Boolean) || [];
  return { data: permissions, error: null };
}

/**
 * Check if a role is protected (cannot be deleted)
 */
export function isProtectedRole(roleName: string): boolean {
  const protectedRoles = ['Administrator', 'Team Lead', 'Estimator'];
  return protectedRoles.includes(roleName);
}

/**
 * Change a member's role (promote/demote)
 */
export async function changeMemberRole(
  memberId: string,
  newRoleId: string
): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('team_members')
    .update({ role_id: newRoleId })
    .eq('id', memberId);

  return { error };
}

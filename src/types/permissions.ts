/**
 * Permission Types
 *
 * Types for the role-based permission system
 */

// Permission categories
export type PermissionCategory = 'Team' | 'Projects' | 'Estimates' | 'Database' | 'Settings' | 'Admin';

// Permission codes (for type safety)
export type PermissionCode =
  // Team
  | 'team.view'
  | 'team.invite'
  | 'team.edit'
  | 'team.delete'
  // Projects
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'projects.delete'
  | 'projects.assign'
  // Estimates
  | 'estimates.view'
  | 'estimates.create'
  | 'estimates.edit'
  | 'estimates.delete'
  | 'estimates.approve'
  // Database
  | 'database.view'
  | 'database.edit'
  // Settings
  | 'settings.view'
  | 'settings.edit'
  // Admin
  | 'admin.access'
  | 'admin.roles'
  | 'admin.permissions';

// Permission record from database
export interface Permission {
  id: string;
  code: PermissionCode;
  name: string;
  description: string | null;
  category: PermissionCategory;
  created_at: string;
}

// Role with permissions
export interface RoleWithPermissions {
  id: string;
  name: string;
  level: number;
  description: string | null;
  created_at: string;
  permissions: Permission[];
  memberCount?: number;
}

// Role permission junction
export interface RolePermission {
  role_id: string;
  permission_id: string;
  created_at: string;
}

// Grouped permissions by category
export interface GroupedPermissions {
  category: PermissionCategory;
  permissions: Permission[];
}

// API Request/Response types
export interface CreateRoleRequest {
  name: string;
  level: number;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  level?: number;
  description?: string;
}

export interface UpdateRolePermissionsRequest {
  permissionIds: string[];
}

export interface RoleResponse {
  success: boolean;
  role?: RoleWithPermissions;
  error?: string;
}

export interface RolesListResponse {
  success: boolean;
  roles?: RoleWithPermissions[];
  error?: string;
}

export interface PermissionsListResponse {
  success: boolean;
  permissions?: Permission[];
  grouped?: GroupedPermissions[];
  error?: string;
}

export interface ChangeMemberRoleRequest {
  roleId: string;
}

// Form data types
export interface RoleFormData {
  name: string;
  level: number;
  description: string;
  permissionIds: string[];
}

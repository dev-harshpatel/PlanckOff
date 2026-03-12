/**
 * Role-based permission types
 */

export type PermissionCategory =
  | "Team"
  | "Projects"
  | "Estimates"
  | "Database"
  | "Settings"
  | "Admin";

export type PermissionCode =
  | "team.view"
  | "team.invite"
  | "team.edit"
  | "team.delete"
  | "projects.view"
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  | "projects.assign"
  | "estimates.view"
  | "estimates.create"
  | "estimates.edit"
  | "estimates.delete"
  | "estimates.approve"
  | "database.view"
  | "database.edit"
  | "settings.view"
  | "settings.edit"
  | "admin.access"
  | "admin.roles"
  | "admin.permissions";

export interface Permission {
  id: string;
  code: PermissionCode;
  name: string;
  description: string | null;
  category: PermissionCategory;
  created_at: string;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  level: number;
  description: string | null;
  created_at: string;
  permissions: Permission[];
  memberCount?: number;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface GroupedPermissions {
  category: PermissionCategory;
  permissions: Permission[];
}

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

export interface RoleFormData {
  name: string;
  level: number;
  description: string;
  permissionIds: string[];
}

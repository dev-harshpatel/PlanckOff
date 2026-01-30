/**
 * useRBAC Hook
 *
 * Client-side hook for role-based access control checks
 */

import { useAuth } from '@/context/AuthContext';
import { RoleName } from '@/types/team';
import {
  ROLE_HIERARCHY,
  hasRoleAccess,
  meetsMinRoleRequirement,
  canAccessRoute,
} from '@/lib/auth/rbac';

export interface RBACHook {
  // Current user's role
  userRole: RoleName | null;

  // Check if user has a specific role
  hasRole: (role: RoleName) => boolean;

  // Check if user has any of the specified roles
  hasAnyRole: (roles: RoleName[]) => boolean;

  // Check if user's role is at least the specified level
  hasMinRole: (minRole: RoleName) => boolean;

  // Check if user can access a specific route
  canAccess: (path: string) => boolean;

  // Convenience checks
  isAdmin: boolean;
  isTeamLead: boolean;
  isEstimator: boolean;
  isTeamLeadOrHigher: boolean;

  // Can user manage other users?
  canManageTeam: boolean;

  // Can user invite users?
  canInviteUsers: boolean;
}

export function useRBAC(): RBACHook {
  const { user, isAuthenticated } = useAuth();

  const userRole = (isAuthenticated && user?.role) as RoleName | null;

  // Check if user has a specific role
  const hasRole = (role: RoleName): boolean => {
    if (!userRole) return false;
    return userRole === role;
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roles: RoleName[]): boolean => {
    if (!userRole) return false;
    return hasRoleAccess(userRole, roles);
  };

  // Check if user's role meets minimum requirement
  const hasMinRole = (minRole: RoleName): boolean => {
    if (!userRole) return false;
    return meetsMinRoleRequirement(userRole, minRole);
  };

  // Check if user can access a route
  const canAccess = (path: string): boolean => {
    const result = canAccessRoute(userRole, path);
    return result.allowed;
  };

  // Convenience flags
  const isAdmin = hasRole('Administrator');
  const isTeamLead = hasRole('Team Lead');
  const isEstimator = hasRole('Estimator');
  const isTeamLeadOrHigher = hasAnyRole(['Administrator', 'Team Lead']);

  // Permission flags
  const canManageTeam = isTeamLeadOrHigher;
  const canInviteUsers = isTeamLeadOrHigher;

  return {
    userRole,
    hasRole,
    hasAnyRole,
    hasMinRole,
    canAccess,
    isAdmin,
    isTeamLead,
    isEstimator,
    isTeamLeadOrHigher,
    canManageTeam,
    canInviteUsers,
  };
}

/**
 * Hook to check a single permission
 * Useful for conditional rendering
 *
 * Usage:
 * ```tsx
 * const canEdit = usePermission(['Administrator', 'Team Lead']);
 * if (canEdit) { ... }
 * ```
 */
export function usePermission(allowedRoles: RoleName[]): boolean {
  const { hasAnyRole } = useRBAC();
  return hasAnyRole(allowedRoles);
}

/**
 * Hook to check minimum role requirement
 *
 * Usage:
 * ```tsx
 * const canAccess = useMinRole('Team Lead');
 * ```
 */
export function useMinRole(minRole: RoleName): boolean {
  const { hasMinRole } = useRBAC();
  return hasMinRole(minRole);
}

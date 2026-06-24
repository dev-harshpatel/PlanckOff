/**
 * Role-Based Access Control (RBAC) Configuration
 *
 * Centralized configuration for route permissions.
 * Easy to add new routes or modify permissions.
 */

import { RoleName } from '@/types/team';
import { ROLE_LEVELS } from '@/constants/roles';

// Role hierarchy levels (lower number = higher authority)
export const ROLE_HIERARCHY: Record<RoleName, number> = ROLE_LEVELS;

/**
 * Route permission configuration
 *
 * Each route can specify:
 * - allowedRoles: Array of roles that can access this route
 * - minRole: Minimum role level required (uses hierarchy)
 * - public: If true, no authentication required
 */
export interface RoutePermission {
  path: string;
  allowedRoles?: RoleName[];
  minRole?: RoleName;
  public?: boolean;
  description?: string;
}

/**
 * Protected Routes Configuration
 *
 * Add new routes here to configure their permissions.
 * Routes not listed here default to requiring authentication (any role).
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // Public routes (no auth required)
  {
    path: '/login',
    public: true,
    description: 'Login page',
  },
  {
    path: '/set-password',
    public: true,
    description: 'Set password page for invited users',
  },

  // Admin only routes
  {
    path: '/admin',
    allowedRoles: ['Administrator'],
    description: 'Admin panel',
  },

  // Team management (Admin + Team Lead)
  {
    path: '/team',
    allowedRoles: ['Administrator', 'Team Lead'],
    description: 'Team management',
  },

  // General protected routes (all authenticated users)
  {
    path: '/dashboard',
    minRole: 'Estimator', // All roles can access
    description: 'Main dashboard',
  },
  {
    path: '/database',
    allowedRoles: ['Administrator', 'Team Lead'],
    description: 'Materials database',
  },
  {
    path: '/prompts',
    minRole: 'Estimator',
    description: 'AI prompt management',
  },
  {
    path: '/assemblies',
    minRole: 'Estimator',
    description: 'Default assemblies',
  },
  {
    path: '/projects',
    minRole: 'Estimator',
    description: 'Projects list',
  },
  {
    path: '/estimates',
    minRole: 'Estimator',
    description: 'Estimates',
  },
  {
    path: '/project',
    minRole: 'Estimator',
    description: 'Project workspace',
  },
  {
    path: '/profile',
    minRole: 'Estimator',
    description: 'Profile settings',
  },
  // {
  //   path: '/admin/roles',
  //   allowedRoles: ['Administrator'],
  //   description: 'Role management',
  // },
];

/**
 * API Route Permissions
 * Similar structure for API routes
 */
export const API_ROUTE_PERMISSIONS: RoutePermission[] = [
  // Public API routes
  {
    path: '/api/auth/login',
    public: true,
  },
  {
    path: '/api/auth/logout',
    public: true,
  },
  {
    path: '/api/team/invite/', // Token validation is public
    public: true,
  },
  {
    path: '/api/team/set-password',
    public: true,
  },

  // Team management APIs (Admin + Team Lead)
  {
    path: '/api/team/members',
    allowedRoles: ['Administrator', 'Team Lead'],
  },
  {
    path: '/api/team/invite',
    allowedRoles: ['Administrator', 'Team Lead'],
  },
  {
    path: '/api/team/roles',
    allowedRoles: ['Administrator', 'Team Lead'],
  },
];

/**
 * Check if a role has access based on allowed roles
 */
export function hasRoleAccess(userRole: RoleName, allowedRoles: RoleName[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Check if a role meets minimum role requirement
 */
export function meetsMinRoleRequirement(userRole: RoleName, minRole: RoleName): boolean {
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[minRole];
}

/**
 * Get permission for a specific route
 */
export function getRoutePermission(path: string, isApi: boolean = false): RoutePermission | undefined {
  const permissions = isApi ? API_ROUTE_PERMISSIONS : ROUTE_PERMISSIONS;

  // First try exact match
  let permission = permissions.find(p => p.path === path);

  // If not found, try prefix match (for dynamic routes like /team/123)
  if (!permission) {
    permission = permissions.find(p => path.startsWith(p.path));
  }

  return permission;
}

/**
 * Check if user can access a route
 */
export function canAccessRoute(
  userRole: RoleName | null,
  path: string,
  isApi: boolean = false
): { allowed: boolean; reason?: string } {
  const permission = getRoutePermission(path, isApi);

  // If no permission config, require authentication but allow any role
  if (!permission) {
    if (!userRole) {
      return { allowed: false, reason: 'Authentication required' };
    }
    return { allowed: true };
  }

  // Public routes
  if (permission.public) {
    return { allowed: true };
  }

  // Check authentication
  if (!userRole) {
    return { allowed: false, reason: 'Authentication required' };
  }

  // Check allowed roles
  if (permission.allowedRoles) {
    if (hasRoleAccess(userRole, permission.allowedRoles)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `This page is only accessible to: ${permission.allowedRoles.join(', ')}`
    };
  }

  // Check minimum role
  if (permission.minRole) {
    if (meetsMinRoleRequirement(userRole, permission.minRole)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Insufficient permissions. Required role: ${permission.minRole} or higher`
    };
  }

  return { allowed: true };
}

/**
 * Get all routes a role can access
 */
export function getAccessibleRoutes(userRole: RoleName): string[] {
  return ROUTE_PERMISSIONS
    .filter(p => {
      if (p.public) return true;
      if (p.allowedRoles) return hasRoleAccess(userRole, p.allowedRoles);
      if (p.minRole) return meetsMinRoleRequirement(userRole, p.minRole);
      return true;
    })
    .map(p => p.path);
}

/**
 * Get navigation items for a role
 * Returns only the routes the user can access
 */
export function getNavItemsForRole(userRole: RoleName): RoutePermission[] {
  return ROUTE_PERMISSIONS.filter(p => {
    if (p.public) return false; // Don't show public routes in nav
    if (p.allowedRoles) return hasRoleAccess(userRole, p.allowedRoles);
    if (p.minRole) return meetsMinRoleRequirement(userRole, p.minRole);
    return true;
  });
}

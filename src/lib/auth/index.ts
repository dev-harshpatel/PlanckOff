/**
 * Auth Module Exports
 *
 * Import from '@/lib/auth' for all auth-related utilities
 */

// Session utilities
export {
  validateSession,
  quickSessionCheck,
  type SessionUser,
  type SessionValidationResult,
} from './session';

// RBAC utilities
export {
  ROLE_HIERARCHY,
  ROUTE_PERMISSIONS,
  API_ROUTE_PERMISSIONS,
  hasRoleAccess,
  meetsMinRoleRequirement,
  getRoutePermission,
  canAccessRoute,
  getAccessibleRoutes,
  getNavItemsForRole,
  type RoutePermission,
} from './rbac';

// API route helper
export { withAuth, withRoleAuth } from './api-helpers';

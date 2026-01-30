'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRBAC } from '@/hooks/useRBAC';
import { RoleName } from '@/types/team';
import { Loader2, ShieldX } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: RoleName[];
  minRole?: RoleName;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * RouteGuard Component
 *
 * Wraps pages/components to protect them based on user role.
 *
 * Usage:
 * ```tsx
 * // Only Admins
 * <RouteGuard allowedRoles={['Administrator']}>
 *   <AdminPanel />
 * </RouteGuard>
 *
 * // Team Lead or higher
 * <RouteGuard minRole="Team Lead">
 *   <TeamManagement />
 * </RouteGuard>
 *
 * // Custom fallback
 * <RouteGuard allowedRoles={['Administrator']} fallback={<NoAccess />}>
 *   <SecretPage />
 * </RouteGuard>
 * ```
 */
export function RouteGuard({
  children,
  allowedRoles,
  minRole,
  fallback,
  redirectTo,
}: RouteGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { hasAnyRole, hasMinRole, userRole } = useRBAC();

  // Check access based on props
  const hasAccess = React.useMemo(() => {
    if (!isAuthenticated) return false;

    if (allowedRoles) {
      return hasAnyRole(allowedRoles);
    }

    if (minRole) {
      return hasMinRole(minRole);
    }

    // If no restrictions, just require authentication
    return true;
  }, [isAuthenticated, allowedRoles, minRole, hasAnyRole, hasMinRole]);

  // Redirect if specified and no access
  useEffect(() => {
    if (!isLoading && !isAuthenticated && redirectTo) {
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, redirectTo, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    if (redirectTo) {
      return (
        <div className="min-h-[400px] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      );
    }

    return fallback || <AccessDenied message="Please log in to access this page" />;
  }

  // No access based on role
  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    const requiredRoles = allowedRoles?.join(', ') || minRole || 'Unknown';
    return (
      <AccessDenied
        message={`This page is restricted to: ${requiredRoles}`}
        currentRole={userRole || undefined}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Default Access Denied component
 */
function AccessDenied({
  message,
  currentRole,
}: {
  message: string;
  currentRole?: string;
}) {
  const router = useRouter();

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600 mb-4">{message}</p>
        {currentRole && (
          <p className="text-sm text-slate-500 mb-4">
            Your current role: <span className="font-medium">{currentRole}</span>
          </p>
        )}
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

/**
 * HOC version of RouteGuard
 *
 * Usage:
 * ```tsx
 * export default withRouteGuard(AdminPage, { allowedRoles: ['Administrator'] });
 * ```
 */
export function withRouteGuard<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<RouteGuardProps, 'children'>
) {
  return function GuardedComponent(props: P) {
    return (
      <RouteGuard {...options}>
        <Component {...props} />
      </RouteGuard>
    );
  };
}

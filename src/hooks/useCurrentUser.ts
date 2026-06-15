import { useAuth } from '@/context/AuthContext';
import { useRBAC } from '@/hooks/useRBAC';

/**
 * Convenience hook that combines auth identity and RBAC in one call.
 * Use this instead of calling useAuth() + useRBAC() separately.
 */
export function useCurrentUser() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const rbac = useRBAC();

  return {
    // Identity
    user,
    isLoading,
    isAuthenticated,
    // Role helpers (from useRBAC)
    ...rbac,
  };
}

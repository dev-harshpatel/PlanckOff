'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-backed drop-in replacement for useSessionStorageSetState.
 *
 * Persists filter Sets as comma-separated URL query params so that
 * browser back/forward navigation preserves the filter state.
 *
 * Drop-in replacement: same [state, setState] tuple signature.
 * setState accepts either a new value or an updater function.
 *
 * URL key format: `{namespace}_{field}` where namespace is the
 * filterStorageKey sanitized to alphanumeric + underscores.
 */
/** Filter objects whose enumerable keys map to `Set` values (serialized to the URL as CSV). */
export function useReportFilters<T extends object>(
  filterStorageKey: string,
  createDefaultState: () => T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Sanitize key to a safe URL namespace
  const namespace = filterStorageKey.replace(/[^a-zA-Z0-9]/g, '_');

  // useMemo is safe here — createDefaultState is useCallback-memoized at call sites
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultState = useMemo(() => createDefaultState(), [createDefaultState]);

  const state = useMemo((): T => {
    const result: Record<string, Set<string>> = {};
    for (const key of Object.keys(defaultState)) {
      const paramKey = `${namespace}_${key}`;
      const raw = searchParams.get(paramKey);
      result[key] = raw
        ? new Set(raw.split(',').filter(Boolean))
        : new Set<string>();
    }
    return result as T;
  }, [namespace, searchParams, defaultState]);

  const setState = useCallback(
    (newStateOrUpdater: T | ((prev: T) => T)) => {
      const newState =
        typeof newStateOrUpdater === 'function'
          ? (newStateOrUpdater as (prev: T) => T)(state)
          : newStateOrUpdater;

      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(defaultState)) {
        const paramKey = `${namespace}_${key}`;
        const set = newState[key as keyof T] as Set<string>;
        if (set.size === 0) {
          params.delete(paramKey);
        } else {
          params.set(paramKey, Array.from(set).join(','));
        }
      }

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [state, namespace, searchParams, defaultState, pathname, router],
  );

  return [state, setState];
}

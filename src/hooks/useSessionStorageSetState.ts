'use client';

import { useCallback, useEffect, useState } from 'react';

type AnySetState = Record<string, Set<string>>;

const serializeSetRecord = <T>(value: T): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(value as AnySetState).map(([key, entries]) => [key, Array.from(entries)]),
  );

const deserializeSetRecord = <T>(
  rawValue: unknown,
  defaultValue: T,
): T => {
  if (!rawValue || typeof rawValue !== 'object') {
    return defaultValue;
  }

  const nextState = { ...(defaultValue as AnySetState) };

  Object.keys(defaultValue as object).forEach((key) => {
    const rawEntries = (rawValue as Record<string, unknown>)[key];
    nextState[key] = new Set(
      Array.isArray(rawEntries) ? rawEntries.filter((entry): entry is string => typeof entry === 'string') : [],
    );
  });

  return nextState as T;
};

/**
 * SSR-safe sessionStorage hook specialized for filter states backed by Sets.
 * Loads on the client after hydration and persists changes per storage key.
 */
export function useSessionStorageSetState<T extends object>(
  key: string,
  createDefaultValue: () => T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => createDefaultValue());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const defaultValue = createDefaultValue();
    setStoredValue(defaultValue);

    try {
      const item = sessionStorage.getItem(key);
      if (item !== null) {
        setStoredValue(deserializeSetRecord(JSON.parse(item), defaultValue));
      }
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
    }

    setIsHydrated(true);
  }, [key, createDefaultValue]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      sessionStorage.setItem(key, JSON.stringify(serializeSetRecord(storedValue)));
    } catch (error) {
      console.warn(`Error setting sessionStorage key "${key}":`, error);
    }
  }, [isHydrated, key, storedValue]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value));
  }, []);

  return [storedValue, setValue];
}

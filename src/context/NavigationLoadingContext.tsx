'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationLoadingContextValue {
  isNavigating: boolean;
  targetHref: string | null;
  startNavigation: (href?: string) => void;
  stopNavigation: () => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextValue | undefined>(undefined);

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [targetHref, setTargetHref] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLocationRef = useRef<string | null>(null);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setTargetHref(null);
    startLocationRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const locationKey = useMemo(() => pathname, [pathname]);

  const startNavigation = useCallback(
    (href?: string) => {
      if (href && href === locationKey) {
        stopNavigation();
        return;
      }

      startLocationRef.current = locationKey;
      setIsNavigating(true);
      setTargetHref(href ?? null);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsNavigating(false);
        setTargetHref(null);
        timeoutRef.current = null;
      }, 15000);
    },
    [locationKey, stopNavigation],
  );

  useEffect(() => {
    if (isNavigating && startLocationRef.current !== null && locationKey !== startLocationRef.current) {
      startLocationRef.current = null;
      stopNavigation();
    }
  }, [isNavigating, locationKey, stopNavigation]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <NavigationLoadingContext.Provider value={{ isNavigating, targetHref, startNavigation, stopNavigation }}>
      {children}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext);
  if (!context) {
    throw new Error('useNavigationLoading must be used within a NavigationLoadingProvider');
  }
  return context;
}

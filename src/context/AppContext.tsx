"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { UserRole, AppSettings } from "@/types";
import { DEFAULT_ROLE_PERMISSIONS } from "@/constants/project";
import {
  AssemblyTemplate,
  DEFAULT_TEMPLATES,
} from "@/constants/defaultAssemblies";

interface AppContextValue {
  // Role Permissions
  rolePermissions: Record<UserRole, string[]>;
  setRolePermissions: (
    value:
      | Record<UserRole, string[]>
      | ((prev: Record<UserRole, string[]>) => Record<UserRole, string[]>),
  ) => void;

  // Default Assemblies
  defaultAssemblies: AssemblyTemplate[];
  setDefaultAssemblies: (
    value:
      | AssemblyTemplate[]
      | ((prev: AssemblyTemplate[]) => AssemblyTemplate[]),
  ) => void;

  // App Settings
  appSettings: AppSettings;
  setAppSettings: (
    value: AppSettings | ((prev: AppSettings) => AppSettings),
  ) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // Persistent Role Permissions
  const [rolePermissions, setRolePermissions] = useLocalStorage<
    Record<UserRole, string[]>
  >("drywallSpec_roles_v1", DEFAULT_ROLE_PERMISSIONS);

  // Persistent Default Assemblies
  const [defaultAssemblies, setDefaultAssemblies] = useLocalStorage<
    AssemblyTemplate[]
  >("drywallSpec_default_assemblies_v1", DEFAULT_TEMPLATES);

  // App Settings
  const [appSettings, setAppSettings] = useLocalStorage<AppSettings>(
    "drywallSpec_settings_v1",
    { defaultCurrency: "USD" },
  );

  const value: AppContextValue = {
    rolePermissions,
    setRolePermissions,
    defaultAssemblies,
    setDefaultAssemblies,
    appSettings,
    setAppSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}

// Convenience hooks for specific parts of the context
export function useRolePermissions() {
  const { rolePermissions, setRolePermissions } = useApp();
  return [rolePermissions, setRolePermissions] as const;
}

export function useDefaultAssemblies() {
  const { defaultAssemblies, setDefaultAssemblies } = useApp();
  return [defaultAssemblies, setDefaultAssemblies] as const;
}

export function useAppSettings() {
  const { appSettings, setAppSettings } = useApp();
  return [appSettings, setAppSettings] as const;
}

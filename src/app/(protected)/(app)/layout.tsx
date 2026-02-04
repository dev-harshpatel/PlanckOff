"use client";

import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { SettingsModal } from "@/components/features/settings/SettingsModal";
import { useApp } from "@/context/AppContext";

/**
 * Layout for routes that need the main app chrome (Navbar, Settings, etc.)
 *
 * This layout is used by: dashboard, database, assemblies, admin, team
 * The project route has its own layout without this chrome.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appSettings, setAppSettings, rolePermissions, setRolePermissions } =
    useApp();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <Navbar onOpenSettings={() => setShowSettings(true)} />

      <main className="flex-1 relative overflow-y-auto">{children}</main>

      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={appSettings}
          onSave={setAppSettings}
          rolePermissions={rolePermissions}
          onUpdateRoles={setRolePermissions}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AppProvider } from "@/context/AppContext";
import { Navbar } from "@/components/layout/Navbar";
import { SettingsModal } from "@/components/features/settings/SettingsModal";
import { useApp } from "@/context/AppContext";

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProjectPage = pathname.startsWith("/project");

  const { appSettings, setAppSettings, rolePermissions, setRolePermissions } =
    useApp();
  const [showSettings, setShowSettings] = useState(false);

  // Project page has its own layout/header
  if (isProjectPage) {
    return <>{children}</>;
  }

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </AppProvider>
  );
}

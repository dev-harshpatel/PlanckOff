"use client";

import { Navbar } from "@/components/layout/Navbar";

/**
 * Layout for routes that need the main app chrome.
 *
 * This layout is used by: dashboard, database, assemblies, admin, team
 * The project route has its own layout without this chrome.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <Navbar />

      <main className="flex-1 relative overflow-y-auto">{children}</main>
    </div>
  );
}

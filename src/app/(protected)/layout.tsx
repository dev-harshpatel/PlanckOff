"use client";

import { AppProvider } from "@/context/AppContext";

/**
 * Root protected layout - ONLY provides context
 *
 * IMPORTANT: This layout must NOT conditionally change its DOM structure
 * based on pathname or any runtime value. Doing so breaks App Router's
 * chunk generation and causes stale chunk 404 errors in dev mode.
 *
 * Instead, use nested route groups to create different layout hierarchies:
 * - (app)/ routes get the Navbar via (app)/layout.tsx
 * - project/ routes have their own layout without Navbar
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppProvider>{children}</AppProvider>;
}

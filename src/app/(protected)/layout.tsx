"use client";

import { AppProvider } from "@/context/AppContext";
import { PipelineProvider } from "@/context/PipelineContext";
import { ImportFilesModal } from "@/components/features/project/ImportFilesModal";

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
 *
 * ImportFilesModal is rendered here so it persists across navigation (pipeline
 * runs in background, minimized bar visible on all pages).
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProvider>
      <PipelineProvider>
        {children}
        <ImportFilesModal />
      </PipelineProvider>
    </AppProvider>
  );
}

'use client';

import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import type { WallAssembly } from '@/types';
import type { MaterialCosting } from '@/types/assembly';
import type { ProjectOverrideMap, OverrideableField } from '@/types/core/projectOverrides';
import { aggregateProjectCosts, type ProjectCosts } from '@/lib/utils/projectCosting';
import { syncProjectOverrides } from '@/lib/utils/projectOverrideSync';
import type { ProjectDataState } from '@/hooks/useProjectData';
import { useApp } from '@/context/AppContext';

export interface ProjectDataContextValue {
  projectId: string;
  assemblies: WallAssembly[];
  materialCostingData: MaterialCosting[];
  overrideMap: ProjectOverrideMap;
  /**
   * Canonical cost object — computed exactly once from materialCostingData + overrideMap.
   * All tabs (Markups, LaborView, MaterialsView, Reports) read from this.
   * None re-aggregate from raw materialCostingData.
   * See: calculations.md § 0 (Cardinal Law)
   */
  projectCosts: ProjectCosts;
  /**
   * Saves a cost override to the API and updates overrideMap in context.
   * projectCosts recomputes automatically via useMemo — no refetch required.
   * See: state-management.md § 5 (Override System)
   */
  updateOverride: (code: string, field: OverrideableField, value: number) => Promise<void>;
  /** Re-fetches all project data. Call after pipeline completes or assembly is saved. */
  refresh: () => void;
  finalOutputId: string | null;
  takeoffOutputId: string | null;
  rawTakeoffRows: unknown[];
  isLoading: boolean;
  error: string | null;
}

const ProjectDataContext = createContext<ProjectDataContextValue | null>(null);

interface ProjectDataProviderProps {
  projectId: string;
  /** All values from useProjectData() — provided by project/page.tsx */
  data: ProjectDataState;
  children: ReactNode;
}

/**
 * Provider for project-scoped data. Place in project/page.tsx above all tabs.
 * Computes projectCosts once — all child tabs consume via useProjectDataContext().
 */
export function ProjectDataProvider({ projectId, data, children }: ProjectDataProviderProps) {
  const { materials } = useApp();

  /**
   * projectCosts is the canonical cost object.
   * It recomputes automatically when materialCostingData or overrideMap changes.
   * This is the ONLY call to aggregateProjectCosts in the entire app.
   */
  const projectCosts = useMemo(
    () => aggregateProjectCosts(data.materialCostingData, data.overrideMap),
    [data.materialCostingData, data.overrideMap],
  );

  /**
   * Save a cost override to the API and update overrideMap reactively.
   * After setOverrideMap fires, projectCosts recomputes automatically via useMemo.
   * No full data refetch needed — override is applied instantaneously.
   */
  const updateOverride = useCallback(
    async (code: string, field: OverrideableField, value: number) => {
      const baselineMaterial = materials.find((m) => m.code === code);
      const baselineValue =
        field === 'hourlyRate'
          ? baselineMaterial?.hourlyRate
          : field === 'productivity'
            ? baselineMaterial?.productivity
            : field === 'wastePercent'
              ? undefined  // No baseline for wastePercent — always treat as override
              : undefined;

      await syncProjectOverrides({
        projectId,
        items: [
          {
            materialCode: code,
            field: field as 'productivity' | 'hourlyRate' | 'wastePercent',
            value,
            baselineValue,
            existingValue: data.overrideMap[code]?.[field] as number | undefined,
          },
        ],
        onOverrideMapChange: data.setOverrideMap,
      });
    },
    [projectId, materials, data.overrideMap, data.setOverrideMap],
  );

  const value = useMemo<ProjectDataContextValue>(
    () => ({
      projectId,
      assemblies: data.assemblies,
      materialCostingData: data.materialCostingData,
      overrideMap: data.overrideMap,
      projectCosts,
      updateOverride,
      refresh: data.refresh,
      finalOutputId: data.finalOutputId,
      takeoffOutputId: data.takeoffOutputId,
      rawTakeoffRows: data.rawTakeoffRows,
      isLoading: data.isLoading,
      error: data.error,
    }),
    [
      projectId,
      data.assemblies,
      data.materialCostingData,
      data.overrideMap,
      data.finalOutputId,
      data.takeoffOutputId,
      data.rawTakeoffRows,
      data.isLoading,
      data.error,
      data.refresh,
      projectCosts,
      updateOverride,
    ],
  );

  return <ProjectDataContext.Provider value={value}>{children}</ProjectDataContext.Provider>;
}

/**
 * Access project data and costs from any component inside the project page tree.
 * Never call useProjectData() directly in components — use this hook instead.
 */
export function useProjectDataContext(): ProjectDataContextValue {
  const ctx = useContext(ProjectDataContext);
  if (!ctx) {
    throw new Error('useProjectDataContext must be used inside <ProjectDataProvider>');
  }
  return ctx;
}

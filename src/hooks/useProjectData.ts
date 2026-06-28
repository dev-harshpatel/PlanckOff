'use client';

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { WallAssembly } from '@/types';
import type { MaterialCosting } from '@/types/assembly';
import type { ProjectOverrideMap } from '@/types/core/projectOverrides';
import type { MaterialDatabaseRow, LabourDatabaseRow } from '@/types/databases';

export interface ProjectDataState {
  assemblies: WallAssembly[];
  materialCostingData: MaterialCosting[];
  rawTakeoffRows: unknown[];
  overrideMap: ProjectOverrideMap;
  finalOutputId: string | null;
  takeoffOutputId: string | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetches all project data. Call after pipeline completes or assembly is saved. */
  refresh: () => void;
  /** Exposes setter so ProjectDataContext can apply optimistic override updates. */
  setOverrideMap: Dispatch<SetStateAction<ProjectOverrideMap>>;
  /** Exposes setter so page can merge AI-detected assemblies into fetched ones. */
  setAssemblies: Dispatch<SetStateAction<WallAssembly[]>>;
  /**
   * Exposes setter for optimistic cost updates (handleUnitCostChange in page.tsx).
   * Phase 3 will remove this once all tabs read from projectCosts.lineItems.
   */
  setMaterialCostingData: Dispatch<SetStateAction<MaterialCosting[]>>;
  /** Full material_database — fetched once on project open; used by assemblyRowResolver. */
  materialDb: MaterialDatabaseRow[];
  /** Full labour_database — fetched once on project open; used by assemblyRowResolver. */
  labourDb: LabourDatabaseRow[];
}

/**
 * Single fetch point for all project data.
 * Replaces the scattered useEffect + fetch calls in project/page.tsx.
 *
 * Rules:
 * - Never auto-fetches on unrelated renders — only re-fetches when refresh() is called.
 * - Stores RAW materialCostingData (no baked overrides) — aggregateProjectCosts applies
 *   overrides reactively inside ProjectDataContext.
 * - Materials (spec_database) are global — read from AppContext, never fetched here.
 *
 * See: .claude/rules/state-management.md — Section 3 (useProjectData Hook)
 */
export function useProjectData(projectId: string | null): ProjectDataState {
  const [assemblies, setAssemblies] = useState<WallAssembly[]>([]);
  const [materialCostingData, setMaterialCostingData] = useState<MaterialCosting[]>([]);
  const [rawTakeoffRows, setRawTakeoffRows] = useState<unknown[]>([]);
  const [overrideMap, setOverrideMap] = useState<ProjectOverrideMap>({});
  const [finalOutputId, setFinalOutputId] = useState<string | null>(null);
  const [takeoffOutputId, setTakeoffOutputId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [materialDb, setMaterialDb] = useState<MaterialDatabaseRow[]>([]);
  const [labourDb, setLabourDb] = useState<LabourDatabaseRow[]>([]);
  // Load both databases once per project page mount — they don't change per project
  const dbsLoadedRef = useRef(false);

  /** Trigger a full data re-fetch — the only way to reload project data after a mutation. */
  const refresh = useCallback(() => {
    setRefreshCount((c) => c + 1);
  }, []);

  // Fetch material + labour databases once per page mount (global reference data)
  useEffect(() => {
    if (dbsLoadedRef.current) return;
    dbsLoadedRef.current = true;

    Promise.all([
      fetch('/api/material-database?all=true', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/labour-database', { credentials: 'include' }).then(r => r.json()),
    ]).then(([matJson, labJson]) => {
      if (matJson.success) setMaterialDb(matJson.data ?? []);
      if (labJson.success) setLabourDb(labJson.data ?? []);
    }).catch(() => {
      // Non-fatal — resolver will return null for unmatched rows
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        // Parallel fetch — assembly data and overrides load simultaneously
        const [assemblyRes, overridesRes] = await Promise.all([
          fetch(`/api/assembly-data?projectId=${projectId}`, { credentials: 'include' }),
          fetch(`/api/projects/${projectId}/material-overrides`, { credentials: 'include' }),
        ]);

        if (cancelled) return;

        // Parse overrides (non-fatal — overrides simply won't apply if load fails)
        let effectiveOverrideMap: ProjectOverrideMap = {};
        try {
          const ovJson = await overridesRes.json();
          if (ovJson.success) effectiveOverrideMap = ovJson.data ?? {};
        } catch {
          // Silently ignore override load failure — not blocking
        }

        // Parse assembly data
        let data: {
          success?: boolean;
          hasData?: boolean;
          assemblies?: WallAssembly[];
          materialData?: { assemblies?: unknown[] };
          rawTakeoffRows?: unknown[];
          finalOutputId?: string | null;
          takeoffOutputId?: string | null;
        };
        try {
          data = await assemblyRes.json();
        } catch {
          if (!cancelled) setIsLoading(false);
          return;
        }

        if (cancelled) return;

        if (!data.success || !data.hasData) {
          setIsLoading(false);
          return;
        }

        const costingDataArray = (data.materialData?.assemblies || []) as MaterialCosting[];

        // assemblies are pre-mapped server-side in /api/assembly-data — no client-side mapping needed.
        // See .claude/rules/pipeline.md Section 4 (Assembly Mapping — Server Side Only).
        const mappedAssemblies: WallAssembly[] = data.assemblies ?? [];

        // Store RAW costing data — overrides are applied reactively in aggregateProjectCosts
        setMaterialCostingData(costingDataArray);
        setAssemblies(mappedAssemblies);
        setRawTakeoffRows(data.rawTakeoffRows ?? []);
        setFinalOutputId(data.finalOutputId ?? null);
        setTakeoffOutputId(data.takeoffOutputId ?? null);
        setOverrideMap(effectiveOverrideMap);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshCount]);

  return {
    assemblies,
    materialCostingData,
    rawTakeoffRows,
    overrideMap,
    finalOutputId,
    takeoffOutputId,
    isLoading,
    error,
    refresh,
    setOverrideMap,
    setAssemblies,
    setMaterialCostingData,
    materialDb,
    labourDb,
  };
}

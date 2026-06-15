'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import type { OverrideableField, OverrideValues, ProjectOverrideMap } from '@/types/core/projectOverrides';
import {
  applyProjectOverrideUpdates,
  removeProjectOverrideFields,
} from '@/lib/utils/projectOverrideState';

export interface OverridePendingState {
  materialCode: string;
  materialName: string;
  field: OverrideableField;
  fieldLabel: string;
  newValue: OverrideValues[OverrideableField];
  /** Called after either local or global save completes successfully */
  onApplied?: () => void;
}

interface UseFieldOverrideReturn {
  pendingOverride: OverridePendingState | null;
  /** Open the Local/Global dialog for a pending field change */
  requestOverride: (state: OverridePendingState) => void;
  /** Save the change to this project only */
  applyLocal: () => Promise<void>;
  /** Save the change to the global spec_database */
  applyGlobal: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
  /** Revert a single field override back to the global DB value */
  revertField: (projectId: string, materialCode: string, field: OverrideableField, onReverted?: () => void) => Promise<void>;
}

export function useFieldOverride(
  projectId: string | null,
  onOverrideMapChange?: (updater: (prev: ProjectOverrideMap) => ProjectOverrideMap) => void,
): UseFieldOverrideReturn {
  const toast = useToast();
  const [pendingOverride, setPendingOverride] = useState<OverridePendingState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const requestOverride = useCallback((state: OverridePendingState) => {
    setPendingOverride(state);
  }, []);

  const cancel = useCallback(() => setPendingOverride(null), []);

  const applyLocal = useCallback(async () => {
    if (!pendingOverride || !projectId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/material-overrides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          materialCode: pendingOverride.materialCode,
          field:        pendingOverride.field,
          value:        pendingOverride.newValue,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Update the in-memory override map immediately so UI reflects change
        onOverrideMapChange?.((prev) =>
          applyProjectOverrideUpdates(prev, pendingOverride.materialCode, [
            { field: pendingOverride.field, value: pendingOverride.newValue },
          ]),
        );
        toast.success('Saved for this project only');
        pendingOverride.onApplied?.();
      } else {
        toast.error(json.error ?? 'Failed to save override');
      }
    } catch {
      toast.error('Failed to save override');
    } finally {
      setIsSaving(false);
      setPendingOverride(null);
    }
  }, [pendingOverride, projectId, toast, onOverrideMapChange]);

  const applyGlobal = useCallback(async () => {
    if (!pendingOverride) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/materials/${encodeURIComponent(pendingOverride.materialCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [pendingOverride.field]: pendingOverride.newValue }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Database updated — affects all projects');
        pendingOverride.onApplied?.();
      } else {
        toast.error(json.error ?? 'Failed to update database');
      }
    } catch {
      toast.error('Failed to update database');
    } finally {
      setIsSaving(false);
      setPendingOverride(null);
    }
  }, [pendingOverride, toast]);

  const revertField = useCallback(async (
    pid: string,
    materialCode: string,
    field: OverrideableField,
    onReverted?: () => void,
  ) => {
    try {
      const res = await fetch(`/api/projects/${pid}/material-overrides`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ materialCode, field }),
      });
      const json = await res.json();
      if (json.success) {
        onOverrideMapChange?.((prev) =>
          removeProjectOverrideFields(prev, materialCode, [field]),
        );
        toast.success('Reverted to database value');
        onReverted?.();
      } else {
        toast.error(json.error ?? 'Failed to revert');
      }
    } catch {
      toast.error('Failed to revert');
    }
  }, [toast, onOverrideMapChange]);

  return { pendingOverride, requestOverride, applyLocal, applyGlobal, cancel, isSaving, revertField };
}

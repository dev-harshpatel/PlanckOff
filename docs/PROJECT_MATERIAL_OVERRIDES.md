# Project Material Overrides — Implementation Spec

**Feature:** Local vs Global material field overrides per project
**Status:** Not started
**Branch:** `feat/project-material-overrides` (create from `feat/take-off-phase`)

---

## 1. Problem Statement

`spec_database` is a global table. Every `MaterialDefinition` field (formulas, MOU values, productivity/unit cost, hourlyRate, sheetBagBox, lengthCover) is shared across all projects.

When a user edits a field in the context of a specific project, there is currently no mechanism to scope that change to only that project. Any change immediately affects all projects that depend on the same material.

**Goal:** When editing a material field from within a project, prompt the user:
> *"Apply to this project only, or update the database (all projects)?"*

---

## 2. Fields That Need This Mechanism

These fields are read directly from `spec_database` at **render time** inside project context — not just at pipeline time.

| Field | TS Name | DB Column | Used In | Impact If Changed Globally |
|-------|---------|-----------|---------|---------------------------|
| Wall formula qty | `formulaQty` | `formula_qty` | formulaEvaluator, AssemblyEditorModal | Changes quantity calc for all projects |
| Wall sec qty formula | `formulaSecQty` | `formula_sec_qty` | formulaEvaluator, AssemblyEditorModal | Changes secondary qty for all projects |
| Ceiling formula qty | `formulaCeilQty` | `formula_ceil_qty` | formulaEvaluator, AssemblyEditorModal | Changes ceiling qty for all projects |
| Ceiling sec formula | `formulaCeilSecQty` | `formula_ceil_sec_qty` | formulaEvaluator, AssemblyEditorModal | Changes ceiling sec qty for all projects |
| Wall UOM | `mouWall` | `mou_wall` | AssemblyEditorModal UOM column | Changes unit label in all projects |
| Wall sec UOM | `mouWallSec` | `mou_wall_sec` | AssemblyEditorModal UOM column | Changes sec unit label in all projects |
| Ceiling UOM | `mouCeil` | `mou_ceil` | AssemblyEditorModal UOM column | — |
| Ceiling sec UOM | `mouCeilSec` | `mou_ceil_sec` | AssemblyEditorModal UOM column | — |
| Prod. rate / unit cost | `productivity` | `productivity` | priceMap, pipeline, AssemblyEditorModal | Changes cost across all projects |
| Mat cost (labor) | `matCost` | `mat_cost` | priceMap, pipeline | Changes labor cost globally |
| Hourly rate | `hourlyRate` | `hourly_rate` | calculateMaterials pipeline | Changes labor hours globally |
| Sheet/bag/box size | `sheetBagBox` | `sheet_bag_box` | formulaEvaluator (packageSize var) | Changes formula variable globally |
| Length/area cover | `lengthCover` | `length_cover` | formulaEvaluator (AreaCover var) | Changes formula variable globally |

**Fields that do NOT need this mechanism** (display/identity only, safe to change globally):
`code`, `description`, `section`, `matCostCode`, `laborCostCode`, `type`, `manufacturer`, `category`, `per`, `priceUpdated`, `width`, `gauge`, `flange`, `screwSpacing`, `note`

---

## 3. Architecture

### 3.1 Data Flow (After Implementation)

```
spec_database (Supabase, global)
        │
        ▼
getAllMaterials()  ←── existing, unchanged
        │
        ▼
resolveProjectMaterials(globalMaterials, projectOverrides)
        │                         ▲
        │              project_material_overrides
        │              (Supabase, project-scoped)
        ▼
Resolved MaterialDefinition[]
  → formulaEvaluator
  → AssemblyEditorModal
  → priceMap (Reports.tsx)
  → calculateMaterials (pipeline)
  → MaterialSearch
```

### 3.2 Override Resolution Rule

For every field: **project override wins over global DB value.**
Only the fields present in the `overrides` JSONB are overridden — all others come from global.

```ts
resolvedMaterial = { ...globalMaterial, ...projectOverride }
```

### 3.3 Edit Flow

```
User edits a field in project context
        │
        ▼
LocalGlobalConfirmModal appears
        │
        ├── "This project only"
        │       └── PATCH /api/projects/[id]/material-overrides
        │               └── upserts project_material_overrides
        │
        └── "All projects"
                └── PATCH /api/materials/[code]
                        └── updates spec_database
```

---

## 4. Database Schema

### Migration file: `017_create_project_material_overrides.sql`

```sql
CREATE TABLE project_material_overrides (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_code text        NOT NULL,
  overrides     jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(project_id, material_code)
);

-- Index for fast project-level lookup
CREATE INDEX idx_pmo_project_id ON project_material_overrides(project_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pmo_updated_at
  BEFORE UPDATE ON project_material_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Why JSONB for `overrides`?**
- Only stores fields that are actually overridden — no nulls for untouched fields
- Schema-flexible — add new overrideable fields without a migration
- One row per material per project — clean, queryable, no fan-out

**`overrides` JSONB shape (TypeScript):
```ts
type MaterialOverrideFields = Partial<Pick<MaterialDefinition,
  | 'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'
  | 'mouWall' | 'mouWallSec' | 'mouCeil' | 'mouCeilSec'
  | 'productivity' | 'matCost' | 'hourlyRate'
  | 'sheetBagBox' | 'lengthCover'
>>;
```

---

## 5. New Files to Create

### 5.1 Type additions — `src/types/core/projectOverrides.ts`

```ts
import type { MaterialDefinition } from '@/types';

/** Fields of MaterialDefinition that can be overridden per-project */
export type OverrideableField = keyof Pick<MaterialDefinition,
  | 'formulaQty' | 'formulaSecQty' | 'formulaCeilQty' | 'formulaCeilSecQty'
  | 'mouWall' | 'mouWallSec' | 'mouCeil' | 'mouCeilSec'
  | 'productivity' | 'matCost' | 'hourlyRate'
  | 'sheetBagBox' | 'lengthCover'
>;

/** One override record per material per project */
export interface ProjectMaterialOverride {
  id: string;
  projectId: string;
  materialCode: string;
  overrides: Partial<Pick<MaterialDefinition, OverrideableField>>;
  createdAt: string;
  updatedAt: string;
}

/** Map keyed by material_code for O(1) lookup */
export type ProjectOverrideMap = Record<string, Partial<Pick<MaterialDefinition, OverrideableField>>>;
```

### 5.2 Repository — `src/lib/db/projectMaterialOverrides.ts`

```ts
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ProjectMaterialOverride, ProjectOverrideMap, OverrideableField } from '@/types/core/projectOverrides';
import type { MaterialDefinition } from '@/types';

const TABLE = 'project_material_overrides';

const toOverride = (row: Record<string, unknown>): ProjectMaterialOverride => ({
  id: row.id as string,
  projectId: row.project_id as string,
  materialCode: row.material_code as string,
  overrides: (row.overrides ?? {}) as ProjectMaterialOverride['overrides'],
  createdAt: row.created_at as string,
  updatedAt: row.updated_at as string,
});

/** Get all overrides for a project as a lookup map keyed by material_code */
export async function getProjectOverrideMap(projectId: string): Promise<{
  data: ProjectOverrideMap | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('material_code, overrides')
    .eq('project_id', projectId);

  if (error) return { data: null, error: { message: error.message } };

  const map: ProjectOverrideMap = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    map[row.material_code as string] = row.overrides as ProjectMaterialOverride['overrides'];
  });
  return { data: map, error: null };
}

/** Upsert a field override for a specific material in a project */
export async function upsertMaterialOverride(
  projectId: string,
  materialCode: string,
  field: OverrideableField,
  value: MaterialDefinition[OverrideableField],
): Promise<{ error: { message: string } | null }> {
  // Use Postgres jsonb merge to only update the specific field
  const { error } = await supabaseAdmin.rpc('upsert_material_override', {
    p_project_id: projectId,
    p_material_code: materialCode,
    p_field: field,
    p_value: JSON.stringify(value),
  });

  return { error: error ? { message: error.message } : null };
}

/** Delete a specific field override (revert to global) */
export async function deleteFieldOverride(
  projectId: string,
  materialCode: string,
  field: OverrideableField,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.rpc('delete_material_override_field', {
    p_project_id: projectId,
    p_material_code: materialCode,
    p_field: field,
  });

  return { error: error ? { message: error.message } : null };
}

/** Delete ALL overrides for a material in a project (full revert) */
export async function deleteAllOverridesForMaterial(
  projectId: string,
  materialCode: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('project_id', projectId)
    .eq('material_code', materialCode);

  return { error: error ? { message: error.message } : null };
}
```

**Note:** The `upsert_material_override` RPC is a Postgres function (added in migration) that does atomic JSONB field merge:
```sql
CREATE OR REPLACE FUNCTION upsert_material_override(
  p_project_id    uuid,
  p_material_code text,
  p_field         text,
  p_value         jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO project_material_overrides(project_id, material_code, overrides)
    VALUES (p_project_id, p_material_code, jsonb_build_object(p_field, p_value))
  ON CONFLICT (project_id, material_code)
  DO UPDATE SET
    overrides  = project_material_overrides.overrides || jsonb_build_object(p_field, p_value),
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_material_override_field(
  p_project_id    uuid,
  p_material_code text,
  p_field         text
) RETURNS void AS $$
BEGIN
  UPDATE project_material_overrides
  SET overrides  = overrides - p_field,
      updated_at = now()
  WHERE project_id = p_project_id
    AND material_code = p_material_code;
END;
$$ LANGUAGE plpgsql;
```

### 5.3 Resolution Utility — `src/lib/utils/resolveProjectMaterial.ts`

```ts
import type { MaterialDefinition } from '@/types';
import type { ProjectOverrideMap } from '@/types/core/projectOverrides';

/**
 * Merge global spec_database values with project-specific overrides.
 * Project overrides win on a per-field basis.
 * Returns the original object reference when no override exists (no allocation).
 */
export function resolveProjectMaterial(
  global: MaterialDefinition,
  overrideMap: ProjectOverrideMap,
): MaterialDefinition {
  const override = overrideMap[global.code];
  if (!override || Object.keys(override).length === 0) return global;
  return { ...global, ...override };
}

/**
 * Resolve an entire materials array against the project override map.
 */
export function resolveProjectMaterials(
  globals: MaterialDefinition[],
  overrideMap: ProjectOverrideMap,
): MaterialDefinition[] {
  if (Object.keys(overrideMap).length === 0) return globals;
  return globals.map((m) => resolveProjectMaterial(m, overrideMap));
}
```

### 5.4 API Route — `src/app/api/projects/[id]/material-overrides/route.ts`

```ts
import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-helpers';
import { success, failure } from '@/lib/api/response';
import {
  getProjectOverrideMap,
  upsertMaterialOverride,
  deleteFieldOverride,
  deleteAllOverridesForMaterial,
} from '@/lib/db/projectMaterialOverrides';
import type { OverrideableField } from '@/types/core/projectOverrides';

// GET /api/projects/[id]/material-overrides
export const GET = withAuth(async (_req, _ctx, { params }) => {
  const { data, error } = await getProjectOverrideMap(params.id);
  if (error) return failure(error.message, 500);
  return success(data);
});

// PATCH /api/projects/[id]/material-overrides
// Body: { materialCode: string, field: OverrideableField, value: unknown }
export const PATCH = withAuth(async (request, _ctx, { params }) => {
  const body = await request.json().catch(() => null);
  if (!body) return failure('Invalid JSON body', 400);

  const { materialCode, field, value } = body;
  if (!materialCode) return failure('materialCode is required', 400);
  if (!field) return failure('field is required', 400);
  if (value === undefined) return failure('value is required', 400);

  const { error } = await upsertMaterialOverride(params.id, materialCode, field as OverrideableField, value);
  if (error) return failure(error.message, 500);
  return success({ materialCode, field, value });
});

// DELETE /api/projects/[id]/material-overrides
// Body: { materialCode: string, field?: OverrideableField }
// Omitting field deletes ALL overrides for that material
export const DELETE = withAuth(async (request, _ctx, { params }) => {
  const body = await request.json().catch(() => null);
  if (!body?.materialCode) return failure('materialCode is required', 400);

  const { error } = body.field
    ? await deleteFieldOverride(params.id, body.materialCode, body.field)
    : await deleteAllOverridesForMaterial(params.id, body.materialCode);

  if (error) return failure(error.message, 500);
  return success(null);
});
```

### 5.5 Hook — `src/hooks/useFieldOverride.ts`

```ts
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import type { OverrideableField } from '@/types/core/projectOverrides';
import type { MaterialDefinition } from '@/types';

interface OverridePendingState {
  materialCode: string;
  materialName: string;
  field: OverrideableField;
  displayLabel: string;
  newValue: MaterialDefinition[OverrideableField];
  onApplied?: () => void;
}

interface UseFieldOverrideReturn {
  pendingOverride: OverridePendingState | null;
  requestOverride: (state: OverridePendingState) => void;
  applyLocal: () => Promise<void>;
  applyGlobal: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

export function useFieldOverride(projectId: string | null): UseFieldOverrideReturn {
  const { toast } = useToast();
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
        body: JSON.stringify({
          materialCode: pendingOverride.materialCode,
          field: pendingOverride.field,
          value: pendingOverride.newValue,
        }),
      });
      const json = await res.json();
      if (json.success) {
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
  }, [pendingOverride, projectId, toast]);

  const applyGlobal = useCallback(async () => {
    if (!pendingOverride) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/materials/${encodeURIComponent(pendingOverride.materialCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [pendingOverride.field]: pendingOverride.newValue }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Updated in database (all projects)');
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

  return { pendingOverride, requestOverride, applyLocal, applyGlobal, cancel, isSaving };
}
```

### 5.6 UI Component — `src/components/features/project/LocalGlobalConfirmModal.tsx`

```tsx
'use client';

import { Globe, FolderOpen } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, Button } from '@/components/ui';

interface LocalGlobalConfirmModalProps {
  isOpen: boolean;
  materialName: string;
  fieldLabel: string;
  isSaving: boolean;
  onLocal: () => void;
  onGlobal: () => void;
  onCancel: () => void;
}

export function LocalGlobalConfirmModal({
  isOpen,
  materialName,
  fieldLabel,
  isSaving,
  onLocal,
  onGlobal,
  onCancel,
}: LocalGlobalConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={`Update "${fieldLabel}"`} size="sm">
      <ModalBody>
        <p className="text-sm text-slate-600 mb-4">
          You changed <span className="font-medium text-slate-800">{materialName}</span>.
          Where should this update apply?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onLocal}
            disabled={isSaving}
            className="flex items-start gap-3 p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 text-left hover:bg-emerald-100 transition-colors"
          >
            <FolderOpen size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">This project only</p>
              <p className="text-xs text-emerald-600">Won't affect other projects</p>
            </div>
          </button>
          <button
            onClick={onGlobal}
            disabled={isSaving}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white text-left hover:bg-slate-50 transition-colors"
          >
            <Globe size={18} className="text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Update database (all projects)</p>
              <p className="text-xs text-slate-500">Changes the global spec database</p>
            </div>
          </button>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
```

---

## 6. Files to Modify

### 6.1 `src/app/(protected)/project/page.tsx`

- Load `ProjectOverrideMap` alongside `materialCostingData` when project loads
- Pass `overrideMap` down to `EstimateResult`
- On project load: call `GET /api/projects/[id]/material-overrides`

```ts
const [overrideMap, setOverrideMap] = useState<ProjectOverrideMap>({});

// In useEffect that loads final output:
const ovRes = await fetch(`/api/projects/${projectId}/material-overrides`);
const ovJson = await ovRes.json();
if (ovJson.success) setOverrideMap(ovJson.data ?? {});
```

### 6.2 `src/components/features/project/EstimateResult.tsx`

- Accept `overrideMap: ProjectOverrideMap` prop
- Before passing `materials` to any component that uses them for formulas/cost/UOM, resolve them:
  ```ts
  const resolvedMaterials = useMemo(
    () => resolveProjectMaterials(materials, overrideMap),
    [materials, overrideMap]
  );
  ```
- Pass `resolvedMaterials` instead of `materials` to `AssemblyEditorModal`, `Reports`

### 6.3 `src/lib/utils/formulaEvaluator.ts`

- No changes needed — it already receives `material: MaterialDefinition` as a param; as long as callers pass the resolved material, it works correctly.

### 6.4 `src/components/features/project/AssemblyEditorModal.tsx`

- Add `projectId` and `onOverrideApplied` props
- Use `useFieldOverride(projectId)` hook
- Wrap formula/MOU/unitCost edit saves with `requestOverride(...)` instead of saving directly
- Render `<LocalGlobalConfirmModal>` driven by `pendingOverride`

### 6.5 `src/components/features/project/FormulaEditModal.tsx`

- Same as AssemblyEditorModal — intercept saves with `requestOverride(...)`

### 6.6 `src/services/gemini/calculateMaterials.ts` (pipeline)

- Accept `overrideMap: ProjectOverrideMap` as a parameter
- Resolve each matched material against overrides before using its fields:
  ```ts
  const resolved = resolveProjectMaterial(matchedMaterial, overrideMap);
  // Use resolved.productivity, resolved.hourlyRate, etc.
  ```

### 6.7 `src/components/features/reports/Reports.tsx` (priceMap)

- `materials` passed to Reports should already be the resolved array (set in EstimateResult)
- No changes needed IF EstimateResult passes `resolvedMaterials`

---

## 7. Override Indicator in UI

When a field has a project-level override, show a visual indicator:

- Small **orange dot** or tag `PROJECT` next to the field value
- Tooltip: "This value is overridden for this project. Click to revert to database value."
- Clicking the indicator calls `DELETE /api/projects/[id]/material-overrides` with `{ materialCode, field }` to revert that field only

---

## 8. Handling "Revert to Global"

From `AssemblyEditorModal` or `FormulaEditModal`, each overridden field should show:
```
[formula value] ↩ Revert to DB
```
Clicking "Revert to DB" calls `deleteFieldOverride(projectId, materialCode, field)` and refreshes the override map.

---

## 9. Pipeline Re-run with Overrides

When the user re-runs the pipeline for a project (via `process-pipeline` API route):

1. Load `ProjectOverrideMap` for the project
2. Pass it into `matchMaterials` and `calculateMaterials`
3. Inside these services, call `resolveProjectMaterial()` before using any material field

This ensures re-runs respect local overrides without polluting the global DB.

---

## 10. Implementation Order (Checklist)

### Phase 1 — Data Layer
- [ ] Write migration `017_create_project_material_overrides.sql` (table + RPC functions)
- [ ] Run migration in Supabase
- [ ] Create `src/types/core/projectOverrides.ts`
- [ ] Create `src/lib/db/projectMaterialOverrides.ts`
- [ ] Create `src/lib/utils/resolveProjectMaterial.ts`
- [ ] Create `src/app/api/projects/[id]/material-overrides/route.ts`
- [ ] Test: GET returns empty map for new project ✓

### Phase 2 — State + Hook
- [ ] Create `src/hooks/useFieldOverride.ts`
- [ ] Create `src/components/features/project/LocalGlobalConfirmModal.tsx`
- [ ] Load `overrideMap` in `page.tsx` on project open
- [ ] Pass `overrideMap` through `EstimateResult` → apply `resolveProjectMaterials`
- [ ] Test: overridden field in DB resolves correctly in UI ✓

### Phase 3 — Wire Up Edit Points
- [ ] `AssemblyEditorModal` — intercept formula and MOU edits
- [ ] `FormulaEditModal` — intercept formula saves
- [ ] Unit cost edit in Materials/Labor/MatLab tabs — currently writes to final_output JSON (keep as-is, already project-specific)
- [ ] Show override indicator (orange dot) on overridden fields
- [ ] Show "Revert to DB" option for overridden fields
- [ ] Test: change formula locally → other projects unchanged ✓
- [ ] Test: change formula globally → all projects see new value ✓

### Phase 4 — Pipeline Propagation
- [ ] Pass `overrideMap` into `calculateMaterials` call in pipeline
- [ ] Apply `resolveProjectMaterial()` inside `calculateMaterials` before using material fields
- [ ] Test: re-run pipeline respects project overrides ✓

---

## 11. Edge Cases & Decisions

| Scenario | Decision |
|----------|----------|
| User deletes a project | Cascade DELETE removes all overrides automatically |
| User imports a new material DB (bulk upsert) | Does NOT touch `project_material_overrides` — local overrides survive global DB updates |
| Two users edit same material in same project simultaneously | Last write wins (Postgres upsert handles atomically) |
| Field override value is set to `null` | Treated as "revert to global" — call `deleteFieldOverride` instead |
| `DatabaseManager` edits | Always global, no dialog shown — DatabaseManager is the admin tool for the global DB |
| unit_cost edited in Materials/Labor/MatLab tabs | Stays in final_output JSON (already project-specific). Does NOT go through override table. Only formula/MOU/productivity edits use the override table. |
| Override map is empty (new project) | `resolveProjectMaterials` returns original array by reference — zero allocation overhead |

---

## 12. Key Constraints (Do Not Violate)

1. `DatabaseManager` edits are always global — no dialog
2. `final_output JSON` unit_cost edits stay in final_output JSON — no migration needed
3. `resolveProjectMaterial()` must be a pure function — no side effects, no API calls
4. The override JSONB must never store `null` values — use `deleteFieldOverride` for reverting
5. All API routes must use `withAuth` — no public endpoints
6. Never query `project_material_overrides` directly in components — always via repository

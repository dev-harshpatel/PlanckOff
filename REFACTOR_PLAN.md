# PlanckOff — Full Refactoring Plan (4 Pillars)
**Date:** 2026-04-09 | **Author:** dev-harshpatel  
**Status:** Implementation Roadmap — read this before touching any file

---

## Overview

The app works, but has four classes of structural debt that will compound as features grow:
1. **Pipeline update failures** — static merge logic runs on every render, overwriting user edits
2. **Repeated calculations** — same cost totals computed in 3+ places (Reports, Markups, LaborView)
3. **Unnecessary DB hits** — no cache; materials, overrides, and project data re-fetched constantly
4. **No single source of truth** — same data flows through different shapes in different tabs

The plan is divided into four pillars. Each pillar is independent and can be shipped separately. Start with Pillar 3 because it unblocks Pillar 4.

---

## PILLAR 1 — Auth Module

### Current Problems (verified 2026-04-09 against actual code)
- Two user tables (`admins` + `team_members`) — login falls through both, sessions are ambiguous
- RBAC routes are hardcoded in `rbac.ts`; adding a route requires a code deploy
- `withAuth` injects `teamMember` but `AuthContext` only exposes a flattened `Admin` object — full TeamMember fields (e.g. `status`, `role_id`) are not accessible in components

> ~~`AuthContext` only exposes `user` — components that need `teamMember.role` must re-fetch~~ **WRONG** — the `user.role` string is already on the Admin object; no re-fetch is needed for role checks.
> ~~Session renewal can fire from two paths causing double-set cookies~~ **WRONG** — the session endpoint only sets a cookie when `renewed === true`; no race condition exists.

### Target State
- Single user table (`team_members`); `admins` deprecated (migration below)
- `AuthContext` exposes full `TeamMember` object alongside `user` for the rare cases where status/role_id is needed
- A single `useCurrentUser()` hook combines `useAuth()` + `useRBAC()` — convenience, not a bug fix
- RBAC route config is the only array to update when adding a new route

### Implementation Steps

#### Step 1.1 — Deprecate `admins` table
- [ ] Create migration: add `is_legacy` flag to `team_members`, copy all `admins` rows with `role_id` mapped
- [ ] Update `src/lib/db/auth.ts` — `resolveSessionFromToken` reads only `team_members`; remove `admins` branch
- [ ] Update `src/lib/auth/sessionResolver.ts` — remove the legacy fallback path (~lines 35–50)
- [ ] Keep `admins` table intact for 1 sprint as safety net; drop in next sprint

#### Step 1.2 — Create `useCurrentUser()` convenience hook
```ts
// src/hooks/useCurrentUser.ts
export function useCurrentUser() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isAdmin, hasMinRole, canManageTeam } = useRBAC();
  return { user, isLoading, isAuthenticated, isAdmin, hasMinRole, canManageTeam };
}
```
Replace direct `useAuth()` + `useRBAC()` paired calls in components with this single hook. This is a DX improvement — not a bug fix.

#### Step 1.3 — Invite flow
- [ ] Audit `src/app/api/team/invite/route.ts` — confirm invite creates `team_members` with `status: 'Invited'`
- [ ] `/api/auth/set-password/route.ts` — confirm it activates the member (status → 'Active')
- [ ] Add: expire old tokens on repeated invite to same email (invalidate previous token)

---

## PILLAR 2 — Pipeline

### Current Problems
- **Two parallel flows** exist: sequential (`/api/extract` → `/api/match` → `/api/finalize`) and unified (`/api/process-pipeline`). The UI uses sequential; `process-pipeline` is dead code.
- **Local file dependency**: `process-pipeline` reads `data/material-database.json`. All other code reads Supabase `spec_database`. These can diverge silently.
- **Pipeline progress not tracked**: `PipelineContext` manages open/close, projectId, and a completion callback — but has no step counter, status enum, or error field. Progress is lost if the user navigates away mid-run.
- **Prompts embedded in code**: `EXTRACT_PROMPT` and `MATCH_PROMPT` are hardcoded strings in service files. The `ai_prompts` table in DB exists but is not used by these services.
- **Assembly mapping is client-side**: `mapFinalOutputToWallAssemblies()` runs in the browser. If the mapping has a bug, all clients see wrong data.
- **No retry/resume**: if step 2 (match) or step 3 (finalize) fails, the user closes the modal and reruns ALL three steps from scratch — even though steps 1 and 2 already saved their outputs to DB. The data is there, but the UI has no way to use it.

### What IS Already Working (do not break these)
- All 3 intermediate outputs are saved unconditionally every run:
  - `/api/parse-takeoff` → always saves to `takeoff_outputs` table
  - `/api/extract` → always saves to `assembly_extractions` table
  - `/api/match` → always saves to `material_matches` table
- The IDs are tracked in `ImportFilesModal` via refs (`takeoffOutputIdRef`, `assemblyExtractionIdRef`, `materialMatchIdRef`)
- The saved data is queryable via `getLatestTakeoffOutput`, `getLatestMaterialMatch`, etc.

### Target State
- **One flow**: sequential 3-step pipeline. Kill `process-pipeline` or make it an admin-only debug route.
- **Prompts always from DB**: `ai_prompts` table is the single source. Code never embeds prompt strings.
- **Pipeline state persisted to DB**: a `pipeline_runs` table tracks step, status, IDs of all saved outputs, and error per project — linking what's already saved.
- **Server-side mapping**: the `/api/assembly-data` endpoint returns data already in `WallAssembly[]` format — no mapping on the client.
- **Retry per step**: if step 3 (finalize) fails, the user can click "Retry from step 3" — the modal already holds the `extractionId` and `matchId` from previous steps. No files need to be re-uploaded.
- **All 3 intermediate JSONs inspectable**: during local/dev testing, a debug panel in the modal shows the raw JSON from each completed step — no need to query Supabase directly to see what was saved.

### Implementation Steps

#### Step 2.1 — Create `pipeline_runs` table
```sql
-- supabase/migrations/XXX_create_pipeline_runs.sql
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending', -- pending | extracting | matching | finalizing | complete | failed
  current_step int not null default 0,    -- 0=none, 1=extract, 2=match, 3=finalize
  extraction_id uuid references assembly_extractions(id),
  match_id uuid references material_matches(id),
  takeoff_id uuid references takeoff_outputs(id),
  final_output_id uuid references final_outputs(id),
  error_step int,
  error_message text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_by uuid references team_members(id)
);
```

#### Step 2.2 — Add `src/lib/db/pipelineRuns.ts` repository
```ts
export async function createPipelineRun(projectId: string, createdBy: string): Promise<DbResult<PipelineRun>>
export async function updatePipelineRunStep(id: string, step: number, status: string, partialIds?: Partial<PipelineRunIds>): Promise<DbResult<PipelineRun>>
export async function getLatestPipelineRun(projectId: string): Promise<DbResult<PipelineRun | null>>
export async function failPipelineRun(id: string, step: number, message: string): Promise<DbResult<PipelineRun>>
```

#### Step 2.3 — Update each pipeline route to use `runId`
```ts
// POST /api/extract — adds runId support
const { projectId, runId, ...rest } = await req.json();
const run = runId ? await getPipelineRun(runId) : await createPipelineRun(projectId, user.id);
await updatePipelineRunStep(run.id, 1, 'extracting');
// ... existing extract logic ...
await updatePipelineRunStep(run.id, 1, 'complete', { extractionId: savedExtraction.id });
return success({ runId: run.id, extractionId: savedExtraction.id });
```
Repeat pattern for `/api/match` and `/api/finalize`.

**How retry works with `runId`:**
- Step 1 completes → `runId` + `extractionId` stored in context
- Step 2 completes → `matchId` added to same run record
- Step 3 fails → run has `status: 'failed'`, `error_step: 3`, but `extraction_id` and `match_id` are already populated
- User clicks "Retry from step 3" → client passes same `runId` + the already-saved `extractionId` and `matchId` → only finalize runs again
- No files re-uploaded. No AI calls for steps 1 and 2.

#### Step 2.3b — Retry UI in `ImportFilesModal`
Replace the current "Close" button in the error view with:
```tsx
// Error state — show which step failed and what can be retried
{stage === 'error' && (
  <div className="flex flex-col gap-3">
    <p className="text-sm text-red-600">{errorMessage}</p>

    {/* Retry from failed step — available if previous steps saved their outputs */}
    {failedStep === 3 && matchId && (
      <Button variant="primary" onClick={() => retryFromStep(3)}>
        Retry Finalize (steps 1 & 2 are saved)
      </Button>
    )}
    {failedStep === 2 && extractionId && (
      <Button variant="primary" onClick={() => retryFromStep(2)}>
        Retry from Match (step 1 is saved)
      </Button>
    )}

    {/* Full restart — always available */}
    <Button variant="ghost" onClick={handleClose}>
      Start Over
    </Button>
  </div>
)}
```
`retryFromStep(step)` calls the appropriate API route with the existing `runId` and saved IDs — skipping completed steps entirely.

#### ~~Step 2.4 — Prompts from DB only~~ ✅ ALREADY COMPLETE

Verified 2026-04-09. The full system is implemented and wired end-to-end:
- `src/lib/db/aiPrompts.ts` — `getResolvedAIPrompt(key)` reads DB first, falls back to `prompt/*.txt`, auto-backfills DB if empty. `AI_PROMPT_KEYS` defined here.
- `/api/extract/route.ts` line 50 — calls `getResolvedAIPrompt(AI_PROMPT_KEYS.PDF_EXTRACTION)`.
- `/api/match/route.ts` line 75 — calls `getResolvedAIPrompt(AI_PROMPT_KEYS.MATERIAL_MATCH)`.
- `/api/ai-prompts/route.ts` — GET loads both prompts, PUT saves updated prompt per key.
- `PromptManagementCard.tsx` — full editing UI with unsaved-change indicator, save, reset.

No action needed.

#### Step 2.5 — Server-side assembly mapping
```ts
// src/app/api/assembly-data/route.ts
// Currently returns raw DB rows → move mapFinalOutputToWallAssemblies() here
import { mapFinalOutputToWallAssemblies } from '@/lib/utils/assemblyJsonMapper';

const wallAssemblies = mapFinalOutputToWallAssemblies(finalOutput.data, takeoff.data);
return success({ assemblies: wallAssemblies, materialCosting: costing, rawTakeoff: takeoff.data.rows });
```
- [ ] Delete `mapFinalOutputToWallAssemblies` calls from `src/app/(protected)/project/page.tsx`
- [ ] Client receives `WallAssembly[]` directly — no transformation on the client

#### Step 2.6 — Expand `PipelineContext` to track state
```ts
// src/context/PipelineContext.tsx — new shape
interface PipelineContextValue {
  isOpen: boolean;
  projectId: string | null;
  runId: string | null;            // tracks active run
  step: 0 | 1 | 2 | 3;
  status: PipelineStatus;
  error: string | null;
  openImport: (projectId: string) => void;
  closeImport: () => void;
  setRunProgress: (runId: string, step: number, status: PipelineStatus) => void;
}
```
`ImportFilesModal` updates context at each step; the UI shows real progress.

#### Step 2.7 — Re-enable local file saves to `data/output/`

**What already exists (do not recreate any of this):**
- `src/lib/utils/localJsonStorage.ts` — `writeJsonToLocal(folder, data, filename?)` is fully implemented, non-fatal on Vercel (wraps write in try/catch, logs a warning, returns `""` on failure).
- `data/output/` with 4 subfolders already created: `assembly/`, `takeoff/`, `material_match/`, `final_output/`.
- Historical JSON files from previous test runs are already in these folders.

**What is broken — `writeJsonToLocal` was commented out in ALL routes:**
```
/api/match/route.ts         line 103  → write commented out
/api/finalize/route.ts      line 235  → write commented out
/api/final-output/[id]/     line 62   → write commented out
/api/process-pipeline/      line 96   → write commented out
```

**What was never added (two routes are completely missing local writes):**
```
/api/extract/route.ts       → no writeJsonToLocal call at all
/api/parse-takeoff/route.ts → no writeJsonToLocal call at all
```

**The fix — 4 files to edit, 2 files to add:**

```ts
// /api/parse-takeoff/route.ts — ADD after saveTakeoffOutput succeeds
void writeJsonToLocal('takeoff', takeoffPayload).then((p) => {
  if (p) console.log('[parse-takeoff] local save:', p);
});

// /api/extract/route.ts — ADD after saveAssemblyExtraction succeeds
void writeJsonToLocal('assembly', assemblyPayload).then((p) => {
  if (p) console.log('[extract] local save:', p);
});

// /api/match/route.ts — UNCOMMENT the existing block at line 103
void writeJsonToLocal('material_match', matchPayload).then((p) => {
  if (p) console.log('[match] local save:', p);
});

// /api/finalize/route.ts — UNCOMMENT the existing block at line 235
void writeJsonToLocal('final_output', result, filename).then((p) => {
  if (p) console.log('[finalize] local save:', p);
});
```

**Rules for this pattern:**
- Always fire-and-forget (`void` + `.then` for logging only) — never `await writeJsonToLocal(...)` in a route handler.
- The DB save always happens first; local file write is a bonus, never a dependency.
- Filenames follow the existing convention: `{folder}-{Date.now()}.json`.
- On Vercel (production), the write silently fails and returns `""` — the `if (p)` guard ensures the log only fires locally.

After this fix, every pipeline run locally produces:
```
data/output/takeoff/takeoff-{ts}.json        ← raw takeoff rows from Excel
data/output/assembly/assembly-{ts}.json      ← PDF extraction JSON
data/output/material_match/material_match-{ts}.json  ← material match JSON
data/output/final_output/final_output-{ts}.json      ← final merged output
```

#### Step 2.8 — Local dev: intermediate result inspector in modal
For local testing, show a collapsible debug panel inside `ImportFilesModal` after each step completes. **This panel only renders when `process.env.NODE_ENV === 'development'`** — never in production.

```tsx
// Inside ImportFilesModal — dev-only debug panel
{process.env.NODE_ENV === 'development' && (
  <details className="mt-4 text-xs border border-slate-200 rounded">
    <summary className="px-3 py-2 cursor-pointer font-medium text-slate-600 bg-slate-50">
      Debug — Intermediate Outputs
    </summary>
    <div className="p-3 flex flex-col gap-3">
      {takeoffResult && (
        <div>
          <p className="font-semibold text-slate-500 mb-1">
            Takeoff Output (ID: {takeoffOutputId})
          </p>
          <pre className="bg-slate-100 p-2 rounded overflow-auto max-h-40 text-[10px]">
            {JSON.stringify(takeoffResult, null, 2)}
          </pre>
        </div>
      )}
      {extractionResult && (
        <div>
          <p className="font-semibold text-slate-500 mb-1">
            PDF Extraction JSON (ID: {extractionId})
          </p>
          <pre className="bg-slate-100 p-2 rounded overflow-auto max-h-40 text-[10px]">
            {JSON.stringify(extractionResult, null, 2)}
          </pre>
        </div>
      )}
      {matchResult && (
        <div>
          <p className="font-semibold text-slate-500 mb-1">
            Material Match JSON (ID: {matchId})
          </p>
          <pre className="bg-slate-100 p-2 rounded overflow-auto max-h-40 text-[10px]">
            {JSON.stringify(matchResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  </details>
)}
```

Store `takeoffResult`, `extractionResult`, `matchResult` as state in `ImportFilesModal` — populated from each step's API response. This gives instant visibility into what the AI produced at each stage without opening Supabase.

#### Step 2.9 — Kill `process-pipeline` (or guard it)
- [ ] Add `withRoleAuth(['Administrator'])` to `/api/process-pipeline/route.ts`
- [ ] Remove `data/material-database.json` dependency — replace with `getMaterialDatabase()` from cache
- [ ] Mark as `DEPRECATED` in route file header until sequential flow covers all cases

---

## PILLAR 3 — Single Source of Truth (State & Data Flow)
### ✅ Steps 3.1 / 3.2 / 3.3 / 3.5 / 3.6 COMPLETE (2026-04-09)

**What was implemented:**
- `src/lib/utils/projectCosting.ts` — created `aggregateProjectCosts(materialCostingData, overrideMap)`: single traversal, applies overrides (productivity→material unit_cost, hourlyRate→labor unit_cost) inline, returns `ProjectCosts` with `lineItems[]`, `totalMaterial`, `totalLabor`, `netDirectCost`, `byTrade`
- `src/hooks/useProjectData.ts` — created: parallel fetch of assembly-data + overrides, stores RAW materialCostingData, exposes `refresh()` (replaces assemblyDataRefreshTrigger counter), exposes setters for optimistic updates
- `src/context/ProjectDataContext.tsx` — created: computes `projectCosts` via `aggregateProjectCosts` in a single `useMemo`, provides `updateOverride()` (saves to API via `syncProjectOverrides`, updates overrideMap reactively), exposes canonical `projectCosts` to all tabs
- `project/page.tsx` — removed `assemblyDataRefreshTrigger` counter; removed the `useEffect([overrideMap])` re-baking effect + `materialCostingDataRef`; `onImportComplete` now calls `refresh()`; wrapped with `<ProjectDataProvider>`; added `effectiveCostingData` useMemo (backward compat bridge for tabs not yet migrated to `projectCosts.lineItems`)

**Backward compat bridge (to remove in Phase 3):**
`effectiveCostingData = applyProjectCostingOverrides(materialCostingData, overrideMap)` — computed via useMemo in page.tsx, passed to EstimateResult so existing tabs (MatLabView, LaborView, MaterialsView) still show correct costs. Phase 3 removes this when those tabs read from `projectCosts.lineItems` via context.

### Current Problems (most critical pillar — verified 2026-04-09)
- ~~**`assemblyDataRefreshTrigger` counter**~~ ✅ FIXED
- ~~**Override effect split across two `useEffect` calls**~~ ✅ FIXED (now reactive via useMemo)
- **Three places calculating costs**: `Reports.tsx` uses `aggregateMaterialsFromCosting`, `MatLabView` has its own reduce, `Markups` uses a separate `useMemo` — all three can produce different totals ← **Phase 3**
- **No cross-tab shared cost object**: `Reports`, `Markups`, `LaborView`, and `MaterialsView` each receive `materialCostingData` as a prop and derive their own totals independently ← **Phase 3**

> ~~`applyProjectCostingOverrides()` sometimes runs inside render~~ **WRONG** — it only runs inside effects and event handlers. The ref guard (`materialCostingDataRef`) is in place.
> ~~Materials re-fetched constantly — no guard~~ **WRONG** — there is already a guard at line 142 of project/page.tsx: `if (materials.length > 0) return;`. Materials are not re-fetched if already loaded.

> ~~Step 3.4 (add materials cache guard)~~ **ALREADY DONE** — the guard exists. See below.

### Target State
- **One `useProjectData` hook** owns all project data fetching — no ad-hoc `useEffect` + `fetch` in pages
- **`ProjectCosts` computed exactly once** via `aggregateProjectCosts()` and stored in context — all tabs read it
- **Overrides are reactive**: stored in context; any change to overrides or costing data triggers a single canonical recompute
- **No unnecessary DB hits**: materials fetched once per session and cached; project data fetched once per project load

### Implementation Steps

#### ~~Step 3.1 — Create `useProjectData` hook~~ ✅ DONE
- [x] Move all `useEffect` data-fetching from `project/page.tsx` into this hook
- [x] Hook exposes `refresh()` — pipeline completion calls `refresh()` to reload data
- [x] No auto-refetch on materials context change (materials is global read-only in this hook)

#### ~~Step 3.2 — Create `ProjectDataContext` for cross-tab sharing~~ ✅ DONE
```ts
// src/context/ProjectDataContext.tsx

interface ProjectDataContextValue {
  projectId: string;
  assemblies: WallAssembly[];
  materialCostingData: MaterialCosting[];
  overrideMap: ProjectOverrideMap;
  projectCosts: ProjectCosts;          // computed once, shared everywhere
  updateOverride: (code: string, field: string, value: number) => Promise<void>;
  refresh: () => void;
}
```
- [x] `projectCosts` is computed via `aggregateProjectCosts(materialCostingData, overrideMap)` inside this context — ONLY here
- [x] `updateOverride` saves to API then updates `overrideMap` in context → triggers recompute of `projectCosts`
- [ ] All tabs (`Reports`, `LaborView`, `MaterialsView`, `Markups`) consume `useProjectDataContext()` — zero direct fetching ← **Phase 3**

#### ~~Step 3.3 — Fix `aggregateProjectCosts` to incorporate overrides~~ ✅ DONE
- [x] `aggregateProjectCosts(materialCostingData, overrideMap)` created in `src/lib/utils/projectCosting.ts`
- [x] Overrides applied inline (no mutation of input data)
- [x] `aggregateProjectCosts` is pure: same inputs → same output always
- [ ] Remove `applyProjectCostingOverrides()` entirely (kept as backward-compat bridge in page.tsx useMemo) ← **Phase 3**

#### ~~Step 3.4 — Materials global cache~~ ✅ ALREADY DONE

Verified 2026-04-09. `project/page.tsx` line 142 already has the guard:
```ts
useEffect(() => {
  const loadMaterials = async () => {
    if (materials.length > 0) return;  // guard: skip if already loaded
    ...
  };
  loadMaterials();
}, [materials.length, setMaterials]);
```
Materials are not re-fetched if already populated. No action needed.

#### ~~Step 3.5 — Eliminate `assemblyDataRefreshTrigger` state~~ ✅ DONE
`project/page.tsx` has a `useState(0)` counter (`assemblyDataRefreshTrigger`) that sits in the dependency array of the main data-load `useEffect`. Any call to `setAssemblyDataRefreshTrigger(prev => prev + 1)` anywhere in the tree triggers a full re-fetch of assembly data, costing data, takeoff, and overrides — even if only one piece changed.

Replace with an explicit `refresh()` function from `useProjectData`:
```ts
const { refresh } = useProjectData(projectId);
// After pipeline completes:
onPipelineComplete={() => refresh()}
// After assembly save:
await saveAssembly(updated); refresh();
```
This makes re-fetches explicit and traceable — no hidden counter increments.

#### ~~Step 3.6 — Fix unit cost override propagation~~ ✅ DONE
Current bug: user changes unit cost in `MaterialsView` → `onUnitCostChange` → saves to DB → updates local `overrideMap` but **does not** update `materialCostingData` → Markups still shows old cost.

Fix:
```ts
// In ProjectDataContext.updateOverride():
async function updateOverride(code: string, field: string, value: number) {
  await fetch(`/api/projects/${projectId}/material-overrides`, { method: 'POST', body: ... });
  setOverrideMap(prev => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
  // projectCosts recomputes automatically via useMemo([materialCostingData, overrideMap])
}
```
Markups, LaborView, and all other tabs now see the updated value instantly — no refetch needed.

---

## PILLAR 4 — Reports, Labour, Materials, Markups
### Steps 4.1 / 4.2 / 4.5 / 4.6 COMPLETE (2026-04-09) — Steps 4.3 / 4.4 pending Phase 3

### Current Problems
- ~~**Old Gemini calculation path still exists**~~ ✅ FIXED — `calculateMaterials.ts` deleted; `Reports.tsx` shows `EmptyState` when no pipeline data
- ~~**Markup chain duplicated**~~ ✅ FIXED — `markupChain.ts` is the single source; both `Markups.tsx` and `Reports.tsx` call `applyMarkupChain()`
- **Filter state not persisted across tabs**: changing filter in Labour tab then switching to Materials resets the filter ← **Phase 3**
- ~~**CSI section mapping is fragile**~~ ✅ FIXED — `getSectionDisplayName()` auto-parses "CODE - Description" format; never falls through silently
- ~~**No validation on markup %**~~ ✅ FIXED — amber warnings in `Markups.tsx` for escalation > 20%, tax > 15%, labor burden > 40%, overhead > 30%, profit > 40%

### Target State
- **One calculation path**: pipeline data only. Old Gemini path removed.
- **`markupChain.ts` is the only place** the markup formula runs (already a rule; now enforced)
- **`ProjectDataContext` provides `projectCosts`** — all four tabs read from it; none recompute
- **Filter state in URL query params** — persists across tab switches and page reloads
- **CSI code dictionary auto-extended** from `spec_database.section` values — never falls through silently

### Implementation Steps

#### ~~Step 4.1 — Remove the old Gemini calculation path~~ ✅ DONE
- [x] Deleted `src/services/gemini/calculateMaterials.ts`
- [x] Removed `calculateMaterials` import from `Reports.tsx` and `AssemblySummaryGrid.tsx`
- [x] Replaced fallback view with `EmptyState` in `Reports.tsx` when no pipeline data
- [ ] Remove `GEMINI_API_KEY` from `.env.example` if only used by the old path ← low priority

#### ~~Step 4.2 — Enforce `markupChain.ts` as single source~~ ✅ DONE
- [x] Created `src/lib/utils/markupChain.ts` with `applyMarkupChain()`, `MarkupBase`, `MarkupConfig`, `MarkupChainResult`
- [x] `Markups.tsx` `totals` useMemo: replaced 37-line inline math with `applyMarkupChain()`
- [x] `Reports.tsx` `financials` useMemo: replaced inline math with `applyMarkupChain()`

#### ~~Step 4.3 — Remove per-tab cost re-aggregation~~ ✅ DONE (Phase 3, 2026-04-10)
- [x] `LaborView.tsx`: toolbar now shows `projectCosts.totalLabor` from context
- [x] `MaterialsView.tsx`: toolbar now shows `projectCosts.totalMaterial` from context
- [x] `MatLabView.tsx`: filter hook replaced; no additional re-aggregation
- [x] Markups: `gcTotal` is the only new calculation it owns — all material/labor inputs from `projectCosts`

#### ~~Step 4.4 — Filter state in URL query params~~ ✅ DONE (Phase 3, 2026-04-10)
```ts
// src/hooks/useReportFilters.ts
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useReportFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filters = {
    trade: searchParams.get('trade') ?? 'all',
    area: searchParams.get('area') ?? 'all',
    section: searchParams.get('section') ?? 'all',
  };

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return { filters, setFilter };
}
```
- [ ] Replace `useSessionStorageSetState` for filter values in all report tabs with `useReportFilters()`
- [ ] Filters survive tab switches and page reloads (URL is the persistence layer)

#### ~~Step 4.5 — Auto-extend CSI dictionary from DB~~ ✅ DONE
- [x] `getSectionDisplayName()` in `Reports.tsx` updated to auto-parse "CODE - Description" format: extracts the human-readable description after " - " as the display name; unknown codes no longer fall through silently to "Other"

#### ~~Step 4.6 — Markup validation~~ ✅ DONE
- [x] Added amber validation warnings in `Markups.tsx` using `AlertTriangle` for: escalation > 20%, tax > 15%, labor burden > 40%, overhead > 30%, profit > 40%
- [x] Warnings shown inline below inputs — non-blocking

---

## Constants & Types Cleanup (Cross-cutting)

These don't belong to one pillar but must be done alongside pillar work.

### New constant files to create
```
src/constants/
├── aiPrompts.ts          ← AI_PROMPT_KEYS enum (PDF_EXTRACTION, MATERIAL_MATCH, etc.)
├── pipeline.ts           ← PIPELINE_STEPS, PIPELINE_STATUS values  
├── csiSections.ts        ← CSI code → display name (move from inline in Reports)
├── markupLimits.ts       ← MAX_MARKUP_PCT, DEFAULT_MARKUP_CONFIG
└── projectStatus.ts      ← PROJECT_STATUS values (if not already clean)
```

### New/updated types to create
```
src/types/
├── pipeline/index.ts     ← PipelineRun, PipelineStep, PipelineStatus
├── reports/index.ts      ← MarkupConfig, MarkupChainResult, MarkupBase (move from Markups.tsx)
└── project/index.ts      ← ProjectOverrideMap, ProjectDataContextValue
```

### Interfaces to centralize (currently inlined in components)
- `ExtendedLineItem` in `MaterialsView.tsx` → move to `src/types/reports/index.ts`
- `MarkupConfig` in `Markups.tsx` → move to `src/types/reports/index.ts`, import everywhere
- `StaffingRow`, `GcRow`, `TravelRow` in `markups/types.ts` → already there, confirm exports are clean

---

## Execution Order

**This is the authoritative implementation sequence. Follow it exactly — do not reorder.**

Dependencies govern the order, not pillar numbers. Read the "Depends on" column before starting any step.

---

### PHASE 0 — Zero-risk quick wins ✅ COMPLETE (2026-04-09)
No dependencies. Cannot break anything. Do these first to get immediate testing value.

| # | Step | What | Status |
|---|------|------|--------|
| 0.1 | **2.7** | Re-enable `writeJsonToLocal` — added to extract + parse-takeoff routes, uncommented in match + finalize routes. All 4 routes now write to `data/output/` when `NODE_ENV === "development"`. | ✅ Done |
| 0.2 | **1.2** | Created `useCurrentUser()` convenience hook at `src/hooks/useCurrentUser.ts`; exported from `src/hooks/index.ts`. Combines `useAuth()` + `useRBAC()` — spreads full RBAC interface. | ✅ Done |

✅ Done: every local pipeline run writes 4 JSON files to `data/output/`; `useCurrentUser` hook exported from hooks barrel.

---

### PHASE 1 — Calculation layer (independent of state architecture) ✅ COMPLETE (2026-04-09)
No dependencies on Phase 2. These are pure utility/component changes. Do the whole phase before starting Phase 2.

| # | Step | What | Status |
|---|------|------|--------|
| 1.1 | **4.2** | Created `src/lib/utils/markupChain.ts` with `applyMarkupChain()`, `MarkupBase`, `MarkupConfig`, `MarkupChainResult`. Replaced inline `totals` useMemo in `Markups.tsx`. Updated `financials` useMemo in `Reports.tsx`. | ✅ Done |
| 1.2 | **4.1** | Removed `calculateMaterials` import and calls from `Reports.tsx`, `AssemblySummaryGrid.tsx`. Deleted `src/services/gemini/calculateMaterials.ts`. Replaced fallback view with `EmptyState` when no `pipelineProposalData`. | ✅ Done |
| 1.3 | **4.5** | Updated `getSectionDisplayName()` in `Reports.tsx` to auto-parse the human-readable name from any section string (format: "CODE - Description"), enabling dynamic extension from `spec_database.section` values without updating the static dictionary. | ✅ Done |
| 1.4 | **4.6** | Added amber validation warnings in `Markups.tsx` for: escalation > 20%, tax > 15%, labor burden > 40%, overhead > 30%, profit > 40%. Uses `AlertTriangle` from lucide-react. | ✅ Done |

✅ Done: `markupChain.ts` is the single formula source; Reports shows EmptyState when no pipeline data; markup % warnings visible; Gemini fallback deleted.

---

### PHASE 2 — State architecture (Pillar 3) ✅ COMPLETE (2026-04-09)
Do this as one continuous block — do not split across sessions. Each step depends on the previous.

| # | Step | What | Status |
|---|------|------|--------|
| 2.1 | **3.1** | Created `src/hooks/useProjectData.ts` — parallel fetch (assembly-data + overrides), raw materialCostingData, `refresh()` replaces counter | ✅ Done |
| 2.2 | **3.3** | Created `src/lib/utils/projectCosting.ts` — `aggregateProjectCosts(materialCostingData, overrideMap)`: single traversal, overrides applied inline, returns canonical `ProjectCosts` | ✅ Done |
| 2.3 | **3.2** | Created `src/context/ProjectDataContext.tsx` — `ProjectDataProvider` + `useProjectDataContext()`; `projectCosts` computed once via useMemo; `updateOverride()` wired to `syncProjectOverrides` | ✅ Done |
| 2.4 | **3.5** | Removed `assemblyDataRefreshTrigger` counter from `project/page.tsx`; removed `materialCostingDataRef`; removed `useEffect([overrideMap])` re-baking effect; `onImportComplete` calls `refresh()` | ✅ Done |
| 2.5 | **3.6** | `updateOverride()` in `ProjectDataContext` — saves to API via `syncProjectOverrides`, calls `setOverrideMap`, `projectCosts` recomputes automatically via useMemo | ✅ Done |

✅ Done: `assemblyDataRefreshTrigger` counter eliminated; `ProjectDataContext` provides canonical `projectCosts`; overrides now reactive (no effect needed). **Backward-compat bridge**: `effectiveCostingData = applyProjectCostingOverrides(...)` useMemo in `page.tsx` passes baked data to existing tabs — Phase 3 removes this when tabs read from `projectCosts.lineItems` via context.

---

### PHASE 3 — Reports wired to context ✅ COMPLETE (2026-04-10)

| # | Step | What | Depends on | Status |
|---|------|------|-----------|--------|
| 3.1 | **4.3** | Remove per-tab cost re-aggregation — `LaborView`, `MaterialsView`, `MatLabView`, `Markups` all read `projectCosts` from `ProjectDataContext` | Phase 2 done | ✅ Done |
| 3.2 | **4.4** | Replace `sessionStorage` filter state with URL query params via `useReportFilters()` hook | — | ✅ Done |

**What was done:**
- `src/lib/utils/projectCosting.ts` — extended `CostLineItem` with `assemblyType`; added `getTradeFromDescription()` and `normalizeAssemblyType()` pure functions; correct `area` (from `assembly.level`) and `trade` (from description/section) now flow into all line items
- `src/hooks/useReportFilters.ts` — created; URL-backed drop-in replacement for `useSessionStorageSetState`; serializes Sets as comma-separated URL params; browser back/forward restores filter state
- `src/components/features/reports/Markups.tsx` — fully migrated to `useProjectDataContext()`; removed `markupItems`, `materialCostingData`, `priceMap` props; removed `flattenMaterialCostingToItems`, `getItemCost`, `getTradeFromCategory`, `normalizeAssemblyTypeForCategory`, `normalizeCategoryForDisplay`; breakdowns derived from `projectCosts.lineItems`; markup chain uses `projectCosts.totalMaterial` + `projectCosts.totalLabor`
- `src/components/features/reports/LaborView.tsx` — replaced filter hook; added `useProjectDataContext()`; toolbar shows `projectCosts.totalLabor`
- `src/components/features/reports/MaterialsView.tsx` — replaced filter hook; added `useProjectDataContext()`; toolbar shows `projectCosts.totalMaterial`
- `src/components/features/reports/MatLabView.tsx` — replaced filter hook with `useReportFilters`
- `src/components/features/reports/Reports.tsx` — removed `markupItems`, `materialCostingData`, `priceMap` from `<MarkupsView>` call
- `src/hooks/index.ts` — exported `useReportFilters`

✅ Done: Labour tab total === Markups labour input (same source: `projectCosts.totalLabor`); filter state survives browser back/forward via URL params.

---

### PHASE 4 — Pipeline improvements (Pillar 2)
Completely independent from Phases 2 and 3. Can be done in any order relative to them.

| # | Step | What | Depends on | Est. |
|---|------|------|-----------|------|
| ~~4.1~~ | **2.1–2.2** | `pipeline_runs` table migration + `src/lib/db/pipelineRuns.ts` repository | — | ✅ Done |
| ~~4.2~~ | **2.3** | Update `/api/extract`, `/api/match`, `/api/finalize` to accept `runId` and update run record at each step | 4.1 | ✅ Done |
| ~~4.3~~ | **2.3b** | Retry UI in `ImportFilesModal` — context-aware retry buttons replace the "Close" only error screen | 4.2 | ✅ Done |
| ~~4.4~~ | **2.6** | Expand `PipelineContext` with `step`, `status`, `error`, `runId`, `setProgress()` | 4.2 | ✅ Done |
| ~~4.5~~ | **2.8** | Dev-only debug panel in `ImportFilesModal` for intermediate JSON inspection | 4.4 | ✅ Done |
| ~~4.6~~ | **2.5** | Move `mapFinalOutputToWallAssemblies()` into `/api/assembly-data` route — client receives `WallAssembly[]` directly | — | ✅ Done |
| ~~4.7~~ | **2.9** | Add `withRoleAuth(['Administrator'])` to `/api/process-pipeline` | — | ✅ Done |

✅ Done when: step 3 failure shows "Retry Finalize" button; every step updates the run record; local runs write all 4 JSONs.

---

### PHASE 5 — Auth cleanup ✅ COMPLETE (2026-04-10)

| # | Step | What | Status |
|---|------|------|--------|
| ~~5.1~~ | **1.1** | Deprecate `admins` table — migration + remove fallback branch in `sessionResolver.ts` | ✅ Done |
| ~~5.2~~ | **1.3** | Invite flow: delete old invitation on re-invite to generate a fresh token (old link invalidated) | ✅ Done |

**What was done:**
- `supabase/migrations/020_deprecate_admins_table.sql` — adds `is_legacy` flag; migrates remaining admins to `team_members` with correct role mapping (fixes migration 005's hardcoded 'Administrator' bug); re-links orphaned auth_sessions to team_member_id
- `src/constants/auth.ts` — removed `admin:admins (...)` JOIN from `SESSION_WITH_ADMIN_FIELDS`
- `src/lib/supabase/types.ts` — removed `admin` field from `SessionWithAdmin`; `AuthSessionInsert.admin_id` removed (now requires `team_member_id`)
- `src/lib/auth/sessionResolver.ts` — `buildUserFromSession` now only reads `session.team_member`; returns null if absent (no admin fallback)
- `src/lib/db/auth.ts` — removed `createSession` (legacy admin session creator)
- `src/app/api/auth/login/route.ts` — removed entire admins fallback block; single `team_members` path only
- `src/app/api/team/invite/route.ts` — on re-invite, deletes old invitation (invalidating old token) then creates fresh one with new token; removed unused `updateInvitation` import

✅ Done: login only queries `team_members`; no `admins` table fallback exists anywhere; old invite links invalidated on re-send.

---

### Already done — do not re-implement
| What | Where |
|------|-------|
| Prompts from DB | `src/lib/db/aiPrompts.ts` + `/api/ai-prompts` + `PromptManagementCard` |
| Materials fetch guard | `project/page.tsx` line 142: `if (materials.length > 0) return;` |

---

### Dependency graph
```
Phase 0 ──────────────────────────── independent
Phase 1 ──────────────────────────── independent
Phase 2: 2.1 → 2.2 → 2.3 → 2.4/2.5 (2.4 and 2.5 parallel after 2.3)
Phase 3: needs Phase 2 complete
Phase 4 ──────────────────────────── independent (4.1 → 4.2 → 4.3/4.4 → 4.5)
Phase 5 ──────────────────────────── do last
```

---

## What NOT to Do

- Do NOT create a global "god" context that holds every piece of state — `ProjectDataContext` holds only current project data; `AuthContext` holds only auth; `PipelineContext` holds only pipeline progress
- Do NOT add a state management library (Redux, Zustand) — the current Context + hooks pattern is sufficient once the fetch logic is centralized
- Do NOT rewrite components — move their data-fetching into hooks and their calculation logic into utils; keep the JSX intact
- Do NOT touch the markup formula order — escalation → tax → burden → overhead → profit is the business rule; the goal is to centralize it, not change it
- Do NOT migrate the DB schema for auth until Pillar 2 and 3 are stable — auth changes are risky and can wait

---

## Done When...

Each pillar is done when:
1. **Pillar 1**: Only `team_members` queried in login flow. `useAuth()` returns `teamMember`. No double cookie-set in logs.
2. **Pillar 2**: `ImportFilesModal` shows step-by-step progress. Retry from failed step works. Prompts editable in DB UI with immediate effect.
3. **Pillar 3**: `project/page.tsx` has zero `useEffect(() => { fetch(...) }, [...])` blocks — all fetching in `useProjectData`. Change override in MaterialsView → Markups total updates without page refresh.
4. **Pillar 4**: Labour tab total === Markups labour input. Material tab total === Markups material input. Filter change survives browser back/forward.

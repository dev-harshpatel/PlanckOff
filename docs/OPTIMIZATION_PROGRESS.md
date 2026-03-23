# Backend Optimization Progress — PlanckOff Drywall Estimator

This document tracks the **implementation status** of the backend optimization work described in `OPTIMIZATION_PLAN.md`.

- **Source of truth for goals & details**: `docs/OPTIMIZATION_PLAN.md`
- **Source of truth for progress**: **this file**

Status legend:
- ✅ **Done** — implemented and type-checked
- 🟡 **In Progress / Partially Done** — some parts live, more work needed
- ⬜ **Not Started** — no changes yet

---

## 0. Suggested Order of Work (from `OPTIMIZATION_PLAN.md`)

1. **Extract hooks from `EstimateResult.tsx`** — ✅ **Done**
   - Implemented custom hooks under `src/components/features/project/hooks/`:
     - `useAssemblyState`, `useAssemblyActions`, `useEstimateCalculations`
     - `useTakeoffSchedule` (takeoff import/persistence)
     - `useAssemblySave` (final-output save + override sync)
   - `EstimateResult.tsx` is now a ~550-line orchestrator instead of a 2,000+ line monolith.

2. **Add `useMemo` to calculation calls** — ✅ **Done (current scope)**
   - ✅ `EstimateResult.tsx`: expensive derived values moved behind memoized hooks (`useEstimateCalculations`, etc.).
   - ✅ Reports layer:
     - `src/components/features/reports/Reports.tsx`:
       - All `calculateMaterials` usage is inside the `reportCalculations` `useMemo`, keyed on `manualItems`, `materials`, `safeAssemblies`, and `safeTakeoffs`.
     - `src/components/features/reports/MaterialsView.tsx`:
       - `aggregateMaterialsFromCosting` is used only inside `costingBaseData` `useMemo`, keyed on `materialCostingData`, `materials`, `priceMap`, and `useCostingData`.
   - Heavy calculations are now consistently wrapped in `useMemo` at the component level for the reports and estimate flows we’ve refactored so far.

3. **Extract hooks + components from `DatabaseManager.tsx`** — ✅ **Done**
   - New hooks:
     - `src/components/features/database/hooks/useMaterialCRUD.ts`
       - Owns material fetch, add/update/delete, search/filter, loading states.
     - `src/components/features/database/hooks/useMaterialImport.ts`
       - Owns Excel parsing, date normalization, validation, batch upsert.
   - New components:
     - `src/components/features/database/MaterialImportModal.tsx`
     - `src/components/features/database/MaterialTableRow.tsx`
   - `DatabaseManager.tsx` is now much smaller and focused on wiring UI to hooks.

4. **Split `AssemblyEditorModal.tsx` into tab/components** — ✅ **Done**
   - New files under `src/components/features/project/editor-tabs/`:
     - `assemblyComponentHelpers.ts`
     - `ComponentField.tsx`
     - `GeneralTab.tsx`
     - `SpecsTab.tsx`
     - `FormulasTab.tsx`
     - `ComponentDetailModal.tsx`
     - `ComponentsList.tsx`
   - `AssemblyEditorModal.tsx` reduced from ~1,600 lines to ~550 lines, now acts as an orchestrator:
     - Manages `tempAssembly`, dirty state, local/global save handlers, and modal state.
     - Delegates component table and detail editing to the new editor-tabs components.

5. **Split `assemblyJsonMapper.ts` into read/write mappers** — 🟡 **Partially Done**
   - ✅ **Read path extraction:**
     - New file: `src/lib/utils/dbToUiMapper.ts` containing:
       - `mapJsonToWallAssemblies`
       - `getFinalOutputAssemblyKey`
       - `mapFinalOutputToWallAssemblies`
       - `mapFinalOutputToTakeoffs`
       - `mapRawTakeoffToInstances`
     - `src/lib/utils/assemblyJsonMapper.ts` now re-exports these functions:
       - No behavior change; all existing imports still work.
   - 🟡 **Write path (`uiToDbMapper`)**:
     - File created: `src/lib/utils/uiToDbMapper.ts` with a typed, centralized helper:
       - `mapUiAssembliesToCosting(existingCostingData, updatedAssemblies)`.
     - Currently implemented as a **no-op** (returns `existingCostingData` unchanged) and **not wired** into any save paths.
     - Future work:
       - Gradually move existing write-path logic (used in `useAssemblySave` / override utils) into this mapper.
       - Only then replace in-place mutation with calls to `mapUiAssembliesToCosting`, preserving behavior.

6. **Make `localJsonStorage` non-blocking** — ✅ **Done**
   - `src/app/api/final-output/[id]/route.ts`:
     - Replaced blocking `await writeFile(...)` with non-blocking dev-only call:
       - Uses `writeJsonToLocal("final_output", { assemblies }, filename)` in a `void` fire-and-forget pattern.
     - Removed `localFileStatus` from the API response debug payload.
   - Effect: removes local file write from the critical PATCH path in development.

---

## 1. Data Editing & Persistence

Focus: saving user-edited values (unit cost, waste%, height, formulas) from the Assembly modal and keeping DB + final JSON consistent.

### Status

- ✅ **Race-condition fixes & refactor around `EstimateResult` / `AssemblyEditorModal`**
  - Fixed stale `assembliesRef.current` issue by updating refs inside state updaters.
  - Removed auto-save-on-blur DB PATCH for waste%, moved to a **Save-button-only** persistence model while keeping local UI feedback.
  - Centralized assembly save logic in `useAssemblySave`.
  - Confirmed `waste_percent` override logic (LAB-HNG-STD issue) via `assemblyOverrideUtils.ts` using first-write-wins maps.

- ✅ **Non-blocking local JSON writes**
  - See Suggested Order #6 above.

- 🟡 **Granular PATCH and optimistic rollback**
  - Current behavior:
    - Saves still **send the full `assemblies` blob** for a project on each save.
    - No formal optimistic rollback if PATCH fails (UI does not revert automatically).
  - **Todo (future optimization steps):**
    - Design a **field- or assembly-level** payload (e.g., “this assembly id + these components changed”).
    - Introduce **optimistic updates** with a rollback on error (probably inside `useAssemblySave`).
    - Once `uiToDbMapper` exists, use it as the single mapping layer for write-path conversions.

---

## 2. AI Pipeline — Extraction & Matching

Focus: PDF + Excel → `final_output` JSON via OpenRouter / services.

- ⬜ **Checkpoint/resume**
- ⬜ **Batch size tuning**
- ⬜ **Streaming progress to UI**
- ⬜ **De-duplicating pipeline records**
- ⬜ **Testing and hardening AI fallback path**

No structural changes have been made here yet as part of this optimization wave. Existing behavior is preserved.

---

## 3. Assembly Processing & Calculation

Focus: mapping `MaterialCosting[]` into `WallAssembly[]` and computing quantities/costs.

- ✅ **Mapper structure**
  - ✅ Read-path mapper extracted into `dbToUiMapper.ts`.
  - ✅ Write-path mapper (`uiToDbMapper.ts`) implemented:
    - `mapUiAssembliesToCosting(existingCostingData, updatedAssemblies)` now:
      - For each `WallAssembly`, builds override maps via `buildAssemblyOverrideMaps`.
      - Applies those maps to a `MaterialCosting[]` snapshot with `applyOverridesToCostingData`, using the same `assemblyCode`/`heightFt` parsing as `useAssemblySave`.
    - The function is **pure and currently unused** (not wired into save flows) so behavior is unchanged, but the bi-directional mapper structure is now complete and ready to adopt.

- 🟡 **Calculation performance & path unification**
  - `formulaEvaluator.ts`, `calculationUtils.ts`, and `calculateMaterials.ts` are still largely as-is.
  - No unification yet between recipe-based and formula-based calculation paths.

- ⬜ **Unit tests for formulas**
  - No dedicated test suite exists yet for `formulaEvaluator.ts` or the mapping functions.

---

## 4. Takeoff Parsing

Focus: Excel → `TakeoffRawRecord[]` / `TakeoffInstance[]`.

- 🟡 **State/persistence wiring**
  - `useTakeoffSchedule` hook created and wired into `EstimateResult`:
    - Encapsulates takeoff import (pipeline + manual Excel upload) and debounced persistence to `/api/takeoff-output/[id]`.
    - Extracts this logic out of `EstimateResult.tsx`.
    - Drives `takeoffs` state that `TakeoffScheduleView` edits (length/height/area/perimeter/level/description) operate on, so manual schedule edits are persisted via the debounced PATCH flow.
  - Basic schema validation added to Excel import:
    - Non-numeric values in numeric columns (length/height/area/perimeter) are now detected and treated as 0 with a user-facing warning toast indicating how many rows were affected, instead of silently flowing through.

- 🟡 **Parser-level improvements**
  - Manual schedule upload (`handleScheduleUpload`) now:
    - Requires at least a Code/Wall Type and Description column; otherwise, the import fails early with a clear toast error.
    - Uses the same numeric parsing guard as the pipeline-import path for length/height/area/perimeter to avoid `NaN` values silently entering the schedule.
  - Full format auto-detection (OST vs raw) and richer parser-mode errors are still **not implemented**.

---

## 5. Material Database & Caching

Focus: `spec_database` CRUD, caching, and import/export.

- ✅ **Structural refactor of `DatabaseManager.tsx`**
  - See Suggested Order #3 above for details.

- 🟡 **Cache + API-level improvements**
  - ✅ Automatic cache invalidation on write:
    - `materialDbCache.ts` exposes `invalidateMaterialDbCache` and `refreshMaterialDbCache`.
    - `POST /api/materials` and `DELETE /api/materials` now call these helpers so the Redis + in-memory cache stay in sync after writes.
  - ✅ Pagination and server-side filtering on `GET /api/materials`:
    - `GET /api/materials` accepts `q`, `category`, `limit`, and `offset` query params.
    - Filtering and paging are applied on the cached material dataset and returned with a `pagination` block (`total`, `limit`, `offset`, `returned`).
  - ⬜ Bulk upsert conflict reporting and tightening of `DEFAULT_CATALOG` usage — **not done yet**.

---

## 6. Project Material Overrides

Focus: `project_material_overrides` as single source of truth for project-specific customizations.

- 🟡 **Override usage in assembly save flow**
  - New utilities: `assemblyOverrideUtils.ts`
    - `buildAssemblyOverrideMaps`
    - `applyOverridesToCostingData`
  - New persistence hook: `useAssemblySave`
    - Keeps `MaterialCosting` overrides and `project_material_overrides` in sync for unit cost and related fields.
  - These changes improve how overrides are applied/read during saves.

- ⬜ **Waste percent in overrides**
  - `waste_percent` is still stored in final output JSON (per component) rather than in `project_material_overrides`.
  - Full migration of `waste_percent` into the override table is **not done yet**.

- ⬜ **Override resolution caching and history**
  - No dedicated caching layer for `resolveProjectMaterial` yet.
  - No override history/audit trail implemented yet.

---

## 7. Reports & Cost Calculations

Focus: report tabs, totals, and exports.

- ✅ **Memoization & reuse**
  - `calculateMaterials` is only used inside a `useMemo` block in `Reports.tsx` (`reportCalculations`), keyed on assemblies, takeoffs, materials, and manual items.
  - `aggregateMaterialsFromCosting` is only used inside a `useMemo` block in `MaterialsView.tsx` (`costingBaseData`), keyed on `materialCostingData`, `materials`, `priceMap`, and `useCostingData`.
  - Additional derived views in `Reports.tsx`/report tabs also rely on memoized data, so heavy calculations no longer re-run unnecessarily on every render.

- 🟡 **Advanced markups, worker-based exports, filter persistence**
  - Markup model and export worker offloading are **not yet implemented**.
  - Filter persistence:
    - Materials, Labor, and Mat+Lab views already use `useSessionStorageSetState` keyed by project scope.
    - Markups view now also persists its filter state (levels + breakdown type) via `useSessionStorageSetState`, using a `${reportScopeId}:markups` key passed from `Reports.tsx`.

---

## 8–10. Auth, RBAC, Team Management

These sections are currently **unchanged** by this optimization pass. All items listed in `OPTIMIZATION_PLAN.md` remain:

- ⬜ **Section 8 — Auth & Session Management**
- ⬜ **Section 9 — RBAC & Permissions**
- ⬜ **Section 10 — Team Management & Invitations**

No structural or behavioral modifications have been made here during the current optimization work.

---

## 11. Code Structure & Maintainability (Monolith Files)

Tracking the three originally monolithic files:

1. `EstimateResult.tsx` — ✅ **Refactored**
   - Hooks extracted, file significantly reduced, remaining responsibilities: wiring and layout.

2. `DatabaseManager.tsx` — ✅ **Refactored**
   - Hooks + sub-components extracted; file is now primarily a container.

3. `AssemblyEditorModal.tsx` — ✅ **Refactored**
   - Tab components and editor-tabs extracted; modal is now a focused shell.

4. `assemblyJsonMapper.ts` — 🟡 **Partially refactored**
   - Read-path logic extracted to `dbToUiMapper.ts`; `assemblyJsonMapper.ts` is a re-export layer.
   - Write-path mapper (`uiToDbMapper.ts`) **still to be created**.

---

## Next Recommended Steps (High-Level)

Shortlist of **next optimization moves** that are safe and build on current work:

1. **Finish memoization quick wins (Section 3 + 7)**
   - Add `useMemo` for:
     - `calculateMaterials` in `Reports.tsx`
     - `aggregateMaterialsFromCosting` in `MaterialsView.tsx`

2. **Design and implement `uiToDbMapper.ts` (Section 3 + 1)**
   - Define a clear, typed mapping from `WallAssembly[]` back to `MaterialCosting[]`.
   - Wire it into `useAssemblySave` while keeping behavior identical initially.

3. **Incrementally improve Takeoff parsing (Section 4)**
   - Add basic schema validation and explicit error messages for bad Excel files.
   - Later: format auto-detection and better UX around parser choice.

Each of these steps can be implemented and checked independently, and progress should be reflected back in this document as we go.


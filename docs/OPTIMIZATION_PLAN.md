# Backend Optimization Plan — PlanckOff Drywall Estimator

This document divides the entire backend into discrete, independently optimizable sections.
Each section describes what it owns, which files are involved, current pain points, and the optimization goal.
Use this as the master reference before starting any optimization work on any domain.

---

## Section Map

| # | Section | Primary Concern |
|---|---------|-----------------|
| 1 | [Data Editing & Persistence](#1-data-editing--persistence) | Saving user edits (costs, waste%, formulas) to DB + final JSON |
| 2 | [AI Pipeline — Extraction & Matching](#2-ai-pipeline--extraction--matching) | PDF extract → material match → finalize flows |
| 3 | [Assembly Processing & Calculation](#3-assembly-processing--calculation) | Mapping, enriching, and calculating assemblies from final output |
| 4 | [Takeoff Parsing](#4-takeoff-parsing) | Excel takeoff → structured takeoff rows |
| 5 | [Material Database & Caching](#5-material-database--caching) | CRUD for spec_database, Redis cache, import/export |
| 6 | [Project Material Overrides](#6-project-material-overrides) | Per-project override layer (unit cost, formula, UOM) |
| 7 | [Reports & Cost Calculations](#7-reports--cost-calculations) | Materials, Labor, MatLab, Markups views + exports |
| 8 | [Auth & Session Management](#8-auth--session-management) | Login, session cookies, middleware guard |
| 9 | [RBAC & Permissions](#9-rbac--permissions) | Role hierarchy, route guards, permission checks |
| 10 | [Team Management & Invitations](#10-team-management--invitations) | Member CRUD, invite flow, role changes |

---

## 1. Data Editing & Persistence

### What It Owns
Saving any user-edited value (unit cost, waste percent, formula, override height) from the Assembly Editor Modal or inline table cells back into the database `final_outputs` record and keeping the local UI state consistent.

### Key Files

| File | Role |
|------|------|
| `src/app/(protected)/project/page.tsx` | Orchestrates all load/save logic; owns `materialCostingData`, `assemblies`, `finalOutputId` state |
| `src/components/features/project/EstimateResult.tsx` | Hosts `assembliesRef`, `handleSaveAssembly`, passes data to children |
| `src/components/features/project/AssemblyEditorModal.tsx` | User-facing editor; calls `updateComponent` on every field change |
| `src/app/api/final-output/[id]/route.ts` | `PATCH` endpoint that persists the updated final output record |
| `src/lib/db/pipelineOutputs.ts` | `updateFinalOutput()` — the single DB write for all final output changes |
| `src/lib/utils/assemblyJsonMapper.ts` | Converts between `WallAssembly[]` (UI) and `MaterialCosting[]` (DB JSON) |
| `src/lib/utils/localJsonStorage.ts` | Writes the updated JSON to `data/output/final_output/` on dev |

### Current Pain Points
- **Single blob update**: every save writes the entire `assemblies` JSON blob for the project, even for a one-field change. There is no field-level patching.
- **Race condition history**: the `assembliesRef.current` stale-read bug (React 18 deferred re-render) was fixed but the fix is fragile — see `docs/WASTAGE_SAVE_ISSUE.md`.
- **No dirty-tracking per field**: the Save button sends every assembly even if only one component changed.
- **Local file write in dev**: `localJsonStorage.ts` runs on every PATCH in development, adding latency and producing many output files.
- **No optimistic rollback**: if the PATCH fails, the UI does not revert to the last saved state.

### Optimization Goal
Introduce field-level or assembly-level granular PATCH payloads so a single-field edit touches only the changed record. Add proper optimistic UI with rollback. Remove the local file write from the critical path (make it async/fire-and-forget or a dev-only flag).

---

## 2. AI Pipeline — Extraction & Matching

### What It Owns
The end-to-end AI workflow that takes a PDF spec sheet + Excel takeoff and produces a structured `final_output` JSON with quantities and costs. Two flows exist: the **sequential flow** (three separate API calls) and the **unified flow** (single process-pipeline call).

### Key Files

| File | Role |
|------|------|
| `src/app/api/extract/route.ts` | Step 1 — PDF → extracted assemblies via OpenRouter |
| `src/app/api/match/route.ts` | Step 2 — assemblies → material matches via OpenRouter |
| `src/app/api/finalize/route.ts` | Step 3 — merges takeoff + match → final output |
| `src/app/api/process-pipeline/route.ts` | Unified single-call flow (preferred) |
| `src/services/openrouter/extractAssemblies.ts` | AI extraction logic |
| `src/services/openrouter/matchMaterials.ts` | AI material matching logic |
| `src/services/openrouter/finalizeAssemblies.ts` | AI fallback finalizer (no-takeoff path) |
| `src/services/openrouter/processWithUnifiedPrompt.ts` | Batched unified AI call (8 assemblies × 2 concurrent) |
| `src/services/openrouter/client.ts` | Base OpenRouter fetch wrapper |
| `src/services/finalize/mergeTakeoffWithMaterialMatch.ts` | Code-only deterministic merger (preferred over AI fallback) |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | Post-processing: stamps `quantity` + `sec_quantity` on all matched items |
| `src/lib/utils/jsonRepair.ts` | Repairs truncated / markdown-wrapped AI JSON responses |
| `src/lib/db/assemblyData.ts` | Saves extraction + match records to `assembly_extractions`, `material_matches` |
| `src/lib/db/pipelineOutputs.ts` | Saves takeoff + final output records |
| `src/context/PipelineContext.tsx` | Holds in-flight pipeline state for the Import modal |

### Current Pain Points
- **No retry/resume**: if Step 2 fails (network timeout, AI quota), the user must restart from Step 1. There is no checkpoint resume.
- **Batching is heuristic**: the unified flow splits 8 assemblies per batch with 2 concurrent batches — these numbers are hardcoded and not tuned per project size.
- **JSON repair is defensive, not preventive**: `jsonRepair.ts` exists because AI responses are malformed — the prompts could be improved to reduce repair frequency.
- **No streaming progress to the UI**: the user sees a spinner with no indication of which batch is running or how many assemblies remain.
- **Duplicate DB writes**: both the sequential and unified flows can produce multiple `assembly_extraction` + `material_match` records for the same project; "latest" logic in `fetchLatest*` functions hides this debt.
- **AI fallback path is untested**: `finalizeAssemblies.ts` (no-takeoff path) is rarely exercised and its output quality is inconsistent.

### Optimization Goal
Add checkpoint/resume so any step can restart from the last saved state. Add real-time progress streaming (Server-Sent Events or polling). Tune batch sizes dynamically. Consolidate duplicate records by project + pipeline run into a single lineage.

---

## 3. Assembly Processing & Calculation

### What It Owns
Converting the raw `MaterialCosting[]` from the database into display-ready UI structures (`WallAssembly[]`, `AssemblyComponent[]`) and computing all quantity and cost values from formulas.

### Key Files

| File | Role |
|------|------|
| `src/lib/utils/assemblyJsonMapper.ts` | Bidirectional mapper: DB `MaterialCosting` ↔ UI `WallAssembly` |
| `src/lib/utils/assemblyDataMapper.ts` | Maps assembly + costing data into flat `MaterialDetailRow[]` for tables |
| `src/lib/utils/calculationUtils.ts` | Core row-level quantity + cost computation helpers |
| `src/lib/utils/quantityFromExtracted.ts` | Computes primary + secondary quantities from an extracted material |
| `src/lib/utils/formulaEvaluator.ts` | Evaluates formula strings (e.g., `LF * height / 32`) against variable maps |
| `src/lib/utils/enrichFinalOutputWithQuantities.ts` | Post-finalize: stamps computed quantities into the DB JSON |
| `src/services/gemini/calculateMaterials.ts` | "Smart assembly recipes" — area/length-based quantity computation per assembly type |
| `src/constants/wasteFactor.ts` | Default waste factors by material category |
| `src/constants/defaultAssemblies.ts` | Pre-built assembly templates with components and formulas |

### Current Pain Points
- **Calculation runs on every render**: `calculateMaterials` is called inside `Reports.tsx` render without memoization, recomputing on every tab switch.
- **Dual calculation paths**: `calculateMaterials.ts` (recipe-based) and `formulaEvaluator.ts` (formula-string-based) serve overlapping purposes and can produce different results for the same assembly.
- **Formula variable naming is fragile**: `formulaEvaluator.ts` normalizes multi-word variable names (e.g., `linear feet` → `LF`) but the normalization rules are ad-hoc and can silently fail.
- **No unit tests for formulas**: formula evaluation is pure logic but has no automated test coverage, making refactors risky.
- **`assemblyJsonMapper.ts` is doing too much**: it handles normalization, type inference, default injection, and bidirectional conversion all in one file — hard to maintain.

### Optimization Goal
Memoize all calculation results keyed by `finalOutputId` + `materialCostingData` hash. Unify the two calculation paths into one canonical evaluator. Add unit tests for `formulaEvaluator.ts`. Split `assemblyJsonMapper.ts` into read-direction and write-direction modules.

---

## 4. Takeoff Parsing

### What It Owns
Converting uploaded Excel files into structured `TakeoffEntry[]` / `TakeoffRawRecord[]` data that the pipeline uses to compute assembly quantities.

### Key Files

| File | Role |
|------|------|
| `src/app/api/parse-takeoff/route.ts` | Receives multipart Excel upload, runs both parsers, saves to DB |
| `src/services/takeoff/parseOSTSheet.ts` | OST format parser — fuzzy column matching + aggregation by assembly + height |
| `src/services/takeoff/parseRawTakeoff.ts` | Raw row-by-row parser matching the Python `excel_to_json.py` format |
| `src/lib/db/pipelineOutputs.ts` | `saveTakeoffOutput()` / `fetchLatestTakeoffOutput()` |
| `src/components/features/project/TakeoffPreview.tsx` | Read-only preview table after Excel parsing |
| `src/components/features/project/TakeoffScheduleView.tsx` | Editable takeoff schedule for manual adjustments |

### Current Pain Points
- **Two parsers with no clear winner**: OST and raw parsers both run and the caller decides which output to use — there is no auto-detection of format and no validation that the right parser was used.
- **Fuzzy column matching is silent**: if `parseOSTSheet.ts` fails to match a column, it silently returns empty rows rather than reporting an error.
- **No schema validation on the parsed output**: malformed Excel files can produce `NaN` quantities that silently corrupt downstream calculations.
- **Takeoff edits not persisted**: `TakeoffScheduleView.tsx` allows editing takeoff instances but changes are not saved back to `takeoff_outputs` in the database.

### Optimization Goal
Add format auto-detection with a clear validation step and user-facing error messages. Validate all numeric fields before saving. Wire `TakeoffScheduleView` edits to a PATCH endpoint for persistence.

---

## 5. Material Database & Caching

### What It Owns
The global `spec_database` table of all material definitions (code, cost, formula, category, UOM, etc.), its API CRUD, the two-tier cache, and the bulk import/export flow.

### Key Files

| File | Role |
|------|------|
| `src/app/api/materials/route.ts` | `GET` all materials / `POST` bulk upsert |
| `src/app/api/materials/[code]/route.ts` | Single-material CRUD |
| `src/lib/db/materials.ts` | All Supabase queries for `spec_database` |
| `src/lib/cache/materialDbCache.ts` | Two-tier cache: Upstash Redis (1h TTL) + in-memory fallback |
| `src/lib/utils/materialDbTrim.ts` | Strips material objects to the minimum fields needed for AI prompts |
| `src/lib/utils/materialValidation.ts` | Validates and normalizes rows from Excel import |
| `src/components/features/database/DatabaseManager.tsx` | Full CRUD UI + Excel import/export |
| `src/constants/materials.ts` | `DEFAULT_CATALOG` hardcoded fallback array |

### Current Pain Points
- **Cache invalidation is manual**: `invalidateMaterialDbCache()` must be called explicitly after any write. If a direct DB write bypasses the API, the cache goes stale with no detection.
- **`DEFAULT_CATALOG` in constants is a maintenance burden**: hardcoded fallback material definitions are duplicated from the DB and will drift over time.
- **Bulk upsert has no conflict reporting**: if 5 out of 200 rows fail to upsert, the API currently returns success for the batch with no detail on which rows failed.
- **AI prompt trimming loses precision**: `materialDbTrim.ts` strips fields to save tokens, but if the AI needs a stripped field (e.g., `size_of_unit`), it silently gets `undefined`.
- **No pagination on `GET /api/materials`**: the endpoint returns all rows every time, which is expensive as the DB grows.

### Optimization Goal
Add automatic cache invalidation on write (write-through or post-write invalidation hook). Add pagination + server-side filtering to the materials API. Add detailed conflict/error reporting to bulk upsert. Remove `DEFAULT_CATALOG` in favor of a required DB seed migration.

---

## 6. Project Material Overrides

### What It Owns
The per-project override layer that lets users change a material's unit cost, formula, or UOM for one specific project without affecting the global spec database.

### Key Files

| File | Role |
|------|------|
| `src/app/api/projects/[id]/material-overrides/route.ts` | `GET` / `PATCH` / `DELETE` overrides for a project |
| `src/lib/db/projectMaterialOverrides.ts` | Supabase queries for `project_material_overrides` table |
| `src/lib/utils/resolveProjectMaterial.ts` | Merges global `MaterialDefinition` with project overrides at read time |
| `src/types/core/projectOverrides.ts` | `OverrideableField`, `OverrideValues`, `ProjectOverrideMap` types |
| `src/hooks/useFieldOverride.ts` | React hook for displaying and committing field overrides from the UI |
| `src/components/features/project/LocalGlobalConfirmModal.tsx` | "Apply locally or globally?" confirmation modal |
| `supabase/migrations/017_create_project_material_overrides.sql` | DB migration for the overrides table |

### Current Pain Points
- **Override resolution happens at read time**: `resolveProjectMaterial.ts` is called on every render that needs a material definition, adding per-item overhead proportional to the number of overrides.
- **No override for waste percent**: `waste_percent` is currently stored in the `final_output` JSON blob (via `assemblies[*].components[*].wasteFactor`), not in the overrides table — making it inconsistent with how other per-project values are handled.
- **No override inheritance or versioning**: there is no history of what was overridden, when, and by whom.
- **Deleting an override silently reverts to global**: users have no warning that deleting an override will change cost calculations across the project.

### Optimization Goal
Move `waste_percent` into `project_material_overrides` alongside other overrideable fields, making the override table the single source of truth for all per-project material customizations. Add override resolution caching (pre-compute the merged map when loading a project). Add an override history log.

---

## 7. Reports & Cost Calculations

### What It Owns
The four report tabs (Materials, Mat+Lab, Labor, Markups) and the PDF/Excel export functionality. All cost totals displayed to the user originate here.

### Key Files

| File | Role |
|------|------|
| `src/components/features/reports/Reports.tsx` | Tab container; calls `calculateMaterials` and routes to sub-views |
| `src/components/features/reports/MaterialsView.tsx` | Aggregated materials table with filtering + export |
| `src/components/features/reports/LaborView.tsx` | Labor table with productivity-based quantities + export |
| `src/components/features/reports/MatLabView.tsx` | Combined material + labor view grouped by assembly |
| `src/components/features/reports/Markups.tsx` | General requirements + GC markup calculations |
| `src/components/features/reports/ExportModal.tsx` | Column picker + Excel/PDF export trigger |
| `src/lib/utils/aggregateMaterialsFromCosting.ts` | Sums quantities + costs per material code across all assemblies |
| `src/lib/utils/exportUtils.ts` | Generates `.xlsx` and `.pdf` from typed column definitions |
| `src/services/gemini/calculateMaterials.ts` | Assembly-level cost calculation engine |

### Current Pain Points
- **`calculateMaterials` runs on every render**: no memoization — every tab switch or filter change recomputes everything from scratch.
- **Report data is not cached between tabs**: switching from Materials → Labor → back to Materials re-aggregates the same data.
- **Markups are percentage-only**: there is no support for fixed-amount or tiered markups.
- **Export runs synchronously on the main thread**: large projects (70+ assemblies, 500+ line items) can freeze the browser tab during export.
- **Filter state is not persisted**: filter selections (section, category, assembly) reset on every tab switch.
- **No grand-total summary row**: the exports don't include a summary line with subtotals, tax, and final contract value.

### Optimization Goal
Memoize `calculateMaterials` and `aggregateMaterialsFromCosting` with `useMemo` keyed on `finalOutputId`. Move export generation to a Web Worker to unblock the UI. Persist filter state in `sessionStorage` per project. Add a configurable summary/totals section to exports.

---

## 8. Auth & Session Management

### What It Owns
Login/logout flow, HTTP-only session cookies, session validation on every API request, and the Edge middleware route guard.

### Key Files

| File | Role |
|------|------|
| `src/app/api/auth/login/route.ts` | Validates credentials, creates session, sets cookie |
| `src/app/api/auth/logout/route.ts` | Deletes session, clears cookie |
| `src/app/api/auth/session/route.ts` | Validates session cookie, returns user data |
| `src/lib/auth/session.ts` | `validateSession()` — reads cookie, queries DB, checks expiry |
| `src/lib/auth/api-helpers.ts` | `withAuth` / `withRoleAuth` HOFs for route handlers |
| `src/lib/auth/rbac.ts` | Route permission map and `canAccessRoute` helper |
| `src/lib/api/cookies.ts` | `setAuthCookie`, `clearAuthCookie`, `getSessionToken` |
| `src/lib/db/auth.ts` | Session CRUD in `auth_sessions` table |
| `src/middleware.ts` | Edge middleware — redirects unauthenticated requests to `/login` |
| `src/context/AuthContext.tsx` | Client-side session state, polls `/api/auth/session` on mount |

### Current Pain Points
- **Session check is a DB query on every API request**: `validateSession()` hits the `auth_sessions` table on every protected API call — no in-memory or edge cache in front of it.
- **Sessions are never pruned**: expired sessions accumulate in `auth_sessions` indefinitely; only deleted on logout.
- **`AuthContext` polls on mount**: the `useEffect` in `AuthContext` refetches session on every component mount instead of caching it.
- **No refresh token**: sessions expire hard at the configured duration with no silent refresh, so active users get logged out mid-work.
- **Admin and team member auth are unified in one flow**: `login/route.ts` branches on `admin` vs `team_member` which creates conditional logic that is hard to extend.

### Optimization Goal
Add a lightweight edge cache (Upstash Redis, same pattern as `materialDbCache.ts`) for session token → user mapping with a short TTL (5 min). Add a background cron to prune expired sessions. Implement a session sliding-window refresh so active users stay logged in. Separate admin and team-member auth into distinct handlers.

---

## 9. RBAC & Permissions

### What It Owns
Role definitions, the role hierarchy, permission codes, route-level access control, and the admin UI for managing roles.

### Key Files

| File | Role |
|------|------|
| `src/lib/auth/rbac.ts` | `ROLE_LEVELS`, `canAccessRoute`, `hasRoleAccess`, route permission config |
| `src/lib/db/roles.ts` | CRUD for `roles` + `permissions` tables, role-permission joins |
| `src/app/api/admin/roles/route.ts` + `[id]/route.ts` | Role CRUD API |
| `src/app/api/admin/permissions/route.ts` | Permissions listing API |
| `src/types/permissions/index.ts` | `PermissionCode`, `Permission`, `RoleWithPermissions` types |
| `src/constants/project.ts` | `DEFAULT_ROLE_PERMISSIONS` map |
| `src/constants/roles.ts` | `ROLE_LEVELS`, `ROLE_COLORS`, `canInviteRole` |
| `src/hooks/useRBAC.ts` | Client-side hook for permission checks in components |

### Current Pain Points
- **Route permission config is hardcoded in `rbac.ts`**: adding a new route or changing access level requires a code deploy, not a DB change.
- **`DEFAULT_ROLE_PERMISSIONS` in constants duplicates DB data**: if the DB roles table diverges from the constants, behavior is unpredictable.
- **No audit log**: there is no record of who changed a role or permission, or when.
- **`withRoleAuth` only checks role level**: it does not check granular `PermissionCode` values — the full permission system is partially wired.

### Optimization Goal
Drive route permissions from the DB `permissions` table rather than hardcoded constants. Add an audit log table for role/permission changes. Complete the wiring of `PermissionCode` checks into `withRoleAuth` so fine-grained permissions work end-to-end.

---

## 10. Team Management & Invitations

### What It Owns
Inviting new team members via email, accepting invites (set-password flow), member CRUD, and role assignment.

### Key Files

| File | Role |
|------|------|
| `src/app/api/team/invite/route.ts` | Creates invitation record + sends email |
| `src/app/api/team/invite/[token]/route.ts` | Validates invite token |
| `src/app/api/team/set-password/route.ts` | Completes invite — hashes password, creates team member |
| `src/app/api/team/members/route.ts` | Lists all team members |
| `src/app/api/team/members/[id]/route.ts` | Update / delete a member |
| `src/app/api/team/members/[id]/role/route.ts` | Change member role |
| `src/lib/db/team.ts` | All Supabase queries for `team_members` + `invitations` |
| `src/lib/email/invitation.ts` | Email dispatch via Supabase mail service |
| `src/components/features/team/TeamManagement.tsx` | Full team management UI |
| `src/constants/roles.ts` | `validatePassword`, `INVITATION_EXPIRY_DAYS` |

### Current Pain Points
- **No resend-invite capability**: if an invite email is lost or expires, there is no UI to regenerate it without deleting and re-creating the invitation.
- **Invitations are never cleaned up**: expired unused invitations accumulate in the `invitations` table.
- **Password validation is minimal**: `validatePassword` in constants only enforces minimum length; no complexity requirements.
- **No self-service profile edit**: team members cannot change their own name or password after the initial set-password flow.
- **Email errors are swallowed**: if Supabase mail fails, the invitation record is still created and marked as sent, leaving the user in a broken state.

### Optimization Goal
Add resend-invite endpoint. Add a cron/scheduled job to delete expired invitations. Add email error handling that rolls back the invitation record on mail failure. Add a `/profile` page for self-service password/name updates.

---

## Cross-Cutting Concerns

These issues span multiple sections and should be addressed as a horizontal effort:

| Concern | Affected Sections | Description |
|---------|------------------|-------------|
| **Error handling consistency** | All API routes | Some routes return `{ error: string }`, others return `{ message: string }` — no unified error response shape. |
| **Logging & observability** | 2, 3, 7 | No structured logging in production; `console.log` only. No request tracing or error aggregation. |
| **Database query N+1** | 3, 6, 7 | Per-assembly override resolution and per-row calculation can trigger many small queries instead of one batched query. |
| **TypeScript strictness gaps** | All | Several utility files use non-null assertions (`!`) and `as` casts instead of proper type guards. |
| **No integration tests** | 2, 4, 5 | The pipeline, takeoff parsers, and material DB have no automated tests; bugs are found by running the app manually. |
| **Dev/prod environment parity** | 1, 2 | `localJsonStorage.ts` writes files in dev but fails silently on Vercel, creating divergent behavior between environments. |

---

## 11. Code Structure & Maintainability

This section covers **file-level refactoring** — not functional changes, but structural ones that make all other optimizations above easier and safer to implement. The backend sections (1–10) cannot be cleanly improved while the primary component files are 1,600–2,100 lines each.

### The Problem: 3 Monolithic Files

The codebase is ~35,000 lines across 216 files. Three files alone account for 5,585 lines (16% of the entire codebase):

| File | Lines | Core Problem |
|------|-------|-------------|
| `src/components/features/project/EstimateResult.tsx` | 2,132 | Handles rendering, state, calculations, export, and tab routing all in one file |
| `src/components/features/database/DatabaseManager.tsx` | 1,787 | Mixes CRUD UI, Excel parsing logic, validation, and date normalization inline |
| `src/components/features/project/AssemblyEditorModal.tsx` | 1,666 | Three-tab editor, material search, formula editing, and override logic all inline |

Everything else is well-structured. The service layer, repository pattern, and type system are solid. The problem is contained to these three files.

---

### Fix: EstimateResult.tsx (2,132 lines → ~300 lines)

**Strategy:** Extract all state + logic into custom hooks, and each tab into its own component.

**Target structure:**
```
src/components/features/project/
├── EstimateResult.tsx               ← ~300 lines: wires hooks, renders tab shell
├── tabs/
│   ├── AssemblySummaryTab.tsx       ← extracted from current inline JSX
│   ├── TakeoffTab.tsx               ← extracted from current inline JSX
│   └── ReportsTab.tsx               ← wrapper that renders <Reports />
└── hooks/
    ├── useAssemblyState.ts          ← all useState for assemblies, selected assembly, open modal
    ├── useAssemblyActions.ts        ← handleSave, handleDelete, handleApplyTemplate
    ├── useEstimateCalculations.ts   ← all useMemo/useCallback for derived calculation values
    └── useEstimateExport.ts         ← Excel export logic
```

**What each hook owns:**

| Hook | Responsibility |
|------|---------------|
| `useAssemblyState` | `useState` for assemblies, selectedAssembly, isEditorOpen, activeTab |
| `useAssemblyActions` | `handleSave`, `handleDelete`, `handleApplyTemplate`, API calls |
| `useEstimateCalculations` | `useMemo` wrappers for all derived calculation values — stops re-computation on every render |
| `useEstimateExport` | All Excel export formatting and download logic |

---

### Fix: DatabaseManager.tsx (1,787 lines → ~300 lines)

**Strategy:** Extract import flow into its own modal component and pull all data logic into hooks.

**Target structure:**
```
src/components/features/database/
├── DatabaseManager.tsx              ← ~300 lines: table + toolbar
├── MaterialImportModal.tsx          ← extracted import flow with FileUploadZone
├── MaterialTableRow.tsx             ← inline editable row (currently inlined in map())
└── hooks/
    ├── useMaterialCRUD.ts           ← fetch, add, update, delete, search, filter state
    └── useMaterialImport.ts         ← Excel parsing, date normalization, validation, batch upsert
```

**What each piece owns:**

| File | Responsibility |
|------|---------------|
| `useMaterialCRUD` | All API calls (`GET /api/materials`, `POST`, `DELETE`), search/filter state, loading states |
| `useMaterialImport` | `xlsx` parsing, Excel serial date conversion, row validation, chunked upsert |
| `MaterialImportModal` | The upload zone, column preview, conflict summary UI — currently scattered inside `DatabaseManager` |
| `MaterialTableRow` | The editable row — extracted from the `rows.map()` block to make the table readable |

---

### Fix: AssemblyEditorModal.tsx (1,666 lines → ~300 lines)

**Strategy:** Each tab becomes its own component. The modal shell only manages tab state and the footer.

**Target structure:**
```
src/components/features/project/
├── AssemblyEditorModal.tsx          ← ~300 lines: tab shell + footer (Save/Cancel)
└── editor-tabs/
    ├── GeneralTab.tsx               ← general assembly settings tab
    ├── SpecsTab.tsx                 ← specs/dimensions tab
    ├── FormulasTab.tsx              ← formula editing tab
    └── ComponentsList.tsx           ← material components table (add/edit/delete rows)
```

---

### Fix: assemblyJsonMapper.ts (445 lines — bidirectional conversion in one file)

This file converts in two directions and is hard to reason about. Split by direction:

```
src/lib/utils/
├── assemblyJsonMapper.ts            ← keep only shared constants and type helpers
├── dbToUiMapper.ts                  ← DB MaterialCosting → UI WallAssembly (read path)
└── uiToDbMapper.ts                  ← UI WallAssembly → DB MaterialCosting (write path)
```

This is a prerequisite for Section 3 (Assembly Processing & Calculation) optimizations.

---

### Quick Wins (Low Risk, High Impact)

These changes require no structural refactoring — just targeted edits:

#### 1. Memoize all calculation results (fixes Section 3 + 7 pain points)

```ts
// In Reports.tsx and EstimateResult.tsx — replace bare calls with useMemo:

// Before (runs on every render):
const results = calculateMaterials(assemblies, materials);

// After (runs only when source data changes):
const results = useMemo(
  () => calculateMaterials(assemblies, materials),
  [assemblies, materials]
);
```

Apply the same pattern to `aggregateMaterialsFromCosting` in `MaterialsView.tsx`.

#### 2. Remove localJsonStorage from the critical PATCH path (fixes Section 1 pain point)

```ts
// Before (blocks the API response while writing files):
await writeLocalJson(data);

// After (non-blocking — fire and forget in dev only):
if (process.env.NODE_ENV === 'development') {
  writeLocalJson(data).catch(() => {}); // intentionally non-blocking
}
```

This eliminates the latency spike on every save in development and removes the dev/prod divergence.

---

### What NOT to Change

These parts of the codebase are correctly structured and should not be refactored:

| Area | Why it's fine |
|------|--------------|
| `src/lib/db/` repository files | Repository pattern is correct and consistent — even at 400–460 lines, they have a single clear responsibility |
| `src/components/ui/` primitives | Well-organized, correctly sized, reused properly |
| `src/types/` | Already split by domain subdirectory |
| `src/services/` | Each service file has a single AI/pipeline responsibility |
| `withAuth` / `withRoleAuth` wrappers | Central auth HOF pattern is clean |
| API route files | Most are under 200 lines with a single domain — acceptable |

---

### Suggested Order of Work

Do these in order — each one makes the next easier:

1. **Extract hooks from `EstimateResult.tsx`** — highest impact; this file blocks Section 1 optimizations
2. **Add `useMemo` to all calculation calls** — zero functional risk, immediate render performance gain
3. **Extract hooks + components from `DatabaseManager.tsx`** — unblocks Section 5 improvements
4. **Split `AssemblyEditorModal.tsx` into tab components** — lower risk, mostly UI movement
5. **Split `assemblyJsonMapper.ts` into read/write mappers** — prerequisite for Section 3 cleanup
6. **Make `localJsonStorage` non-blocking** — one-line change, removes dev latency

---

## How to Use This Document

1. Pick one section to optimize at a time.
2. Read the **Key Files** listed for that section before touching any code.
3. Read any linked docs (e.g., `DATA_SOURCES.md`, `WASTAGE_SAVE_ISSUE.md`, `PROJECT_MATERIAL_OVERRIDES.md`) for additional context.
4. Refer to `docs/PIPELINE_ARCHITECTURE.md` for the full pipeline flow diagram.
5. After optimizing a section, update the **Current Pain Points** in this document to reflect the new state.

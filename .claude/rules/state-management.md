# State Management Rules — Hooks, Context, Data Fetching

Consult this file for: any task that involves fetching project data, managing overrides, sharing state across tabs, writing custom hooks, or reading from `ProjectDataContext`.

---

## 0. The Cardinal Law

> **No component ever fetches project data directly. All project data flows from `useProjectData()` → `ProjectDataContext` → consuming components.**

If you find a `useEffect(() => { fetch('/api/...') }, [...])` inside a feature component, that is a bug, not a pattern. Move the fetch to `useProjectData`.

---

## 1. Data Ownership — Who Owns What

| Data | Owned By | How Components Read It |
|------|----------|----------------------|
| Current user + team member | `AuthContext` via `useCurrentUser()` | `const { user, teamMember } = useCurrentUser()` |
| Global materials (spec_database) | `AppContext` — fetched ONCE on mount, never re-fetched | `const [materials] = useMaterials()` |
| Current project assemblies, costing, takeoff | `ProjectDataContext` via `useProjectData()` | `const { assemblies, materialCostingData } = useProjectData()` |
| Override map | `ProjectDataContext` | `const { overrideMap, updateOverride } = useProjectData()` |
| Canonical project costs | `ProjectDataContext` — computed in context, never in components | `const { projectCosts } = useProjectData()` |
| Pipeline run state | `PipelineContext` via `usePipeline()` | `const { step, status, runId } = usePipeline()` |
| UI-only state (open/close, selected row, filter) | `useState` in the component | N/A |

---

## 2. `useCurrentUser()` Hook — Always Use This

```ts
// src/hooks/useCurrentUser.ts
import { useAuth } from '@/context/AuthContext';
import { useRBAC } from '@/hooks/useRBAC';

export function useCurrentUser() {
  const { user, teamMember, isLoading, isAuthenticated } = useAuth();
  const { isAdmin, hasMinRole, canManageTeam } = useRBAC();
  return { user, teamMember, isLoading, isAuthenticated, isAdmin, hasMinRole, canManageTeam };
}
```

**Rules:**
- Never call `useAuth()` and `useRBAC()` separately in a component — call `useCurrentUser()`.
- Never fetch `teamMember` from an API inside a component — it comes from `AuthContext` via this hook.
- If `teamMember` is `null` and `isAuthenticated` is `true`, the session is being refreshed — show a loading state.

---

## 3. `useProjectData()` Hook — The Only Way to Load Project Data

```ts
// src/hooks/useProjectData.ts — canonical shape

export interface ProjectDataState {
  assemblies: WallAssembly[];
  materialCostingData: MaterialCosting[];
  rawTakeoffRows: unknown[];
  overrideMap: ProjectOverrideMap;
  projectCosts: ProjectCosts;        // computed here — never recomputed downstream
  isLoading: boolean;
  error: string | null;
  refresh: () => void;               // the only way to re-fetch
  updateOverride: (code: string, field: string, value: number) => Promise<void>;
}

export function useProjectData(projectId: string): ProjectDataState { ... }
```

**Fetch rules inside this hook:**
1. Fetch `/api/assembly-data?projectId=X` for assemblies + costing + takeoff — one call
2. Fetch `/api/projects/:id/material-overrides` for overrides — one call
3. Do NOT fetch materials — read them from `useMaterials()` (already in AppContext)
4. Call `refresh()` only when: pipeline completes, assembly is saved, or user explicitly requests

**Computing `projectCosts` inside this hook:**
```ts
const priceMap = useMemo(() => buildProjectPriceMap(materials), [materials]);

const projectCosts = useMemo(
  () => aggregateProjectCosts(materialCostingData, priceMap, overrideMap),
  [materialCostingData, priceMap, overrideMap],
);
```
This is the ONLY place `aggregateProjectCosts` is called. All tabs receive `projectCosts` from this hook — they do not call `aggregateProjectCosts` themselves.

---

## 4. `ProjectDataContext` — Sharing Across Tabs

`ProjectDataContext` wraps the project page and provides `useProjectData()` output to all tabs without prop-drilling.

```tsx
// src/context/ProjectDataContext.tsx

// Provider — place in project/page.tsx or project layout
<ProjectDataContext.Provider value={projectData}>
  {children}
</ProjectDataContext.Provider>

// Consumer — in any tab or sub-component
import { useProjectDataContext } from '@/context/ProjectDataContext';
const { projectCosts, overrideMap, updateOverride } = useProjectDataContext();
```

**Rules:**
- `ProjectDataContext` is project-scoped — it is mounted/unmounted with the project page.
- Never use `ProjectDataContext` outside the project page tree.
- Do not pass `projectCosts` as a prop from page down to tabs — consume from context directly.

---

## 5. Override System — How to Save a Changed Cost

When a user edits a unit cost or quantity in `MaterialsView`:

```ts
// Step 1 — call updateOverride from context (never POST directly from component)
const { updateOverride } = useProjectDataContext();
await updateOverride('code-ABC', 'unit_cost', 42.50);

// What updateOverride does internally:
// 1. POST /api/projects/:id/material-overrides { code, field, value }
// 2. setOverrideMap(prev => { ...prev, [code]: { ...prev[code], [field]: value } })
// 3. projectCosts recomputes automatically via useMemo
// 4. ALL tabs (Markups, LaborView, Reports) see the new total instantly — no refetch
```

**Rules:**
- Never call `fetch('/api/projects/:id/material-overrides')` directly from a component.
- Never update `materialCostingData` directly to apply an override — the override flows through `overrideMap` into `aggregateProjectCosts`.
- After `updateOverride` resolves, `projectCosts` in context is already updated — no additional state mutation needed.

---

## 6. Materials Global Cache — Never Re-fetch

```ts
// src/context/AppContext.tsx — the guard that prevents re-fetching

const materialsLoaded = useRef(false);

useEffect(() => {
  if (materialsLoaded.current) return;  // guard: fetch exactly once
  materialsLoaded.current = true;
  fetch('/api/materials').then(...).then(setMaterials);
}, []);
```

**Rules:**
- `useMaterials()` returns the globally cached materials — call it, never fetch directly.
- If materials need to be refreshed (e.g. after DB import), call a dedicated `refreshMaterials()` function exposed by AppContext — not a new `useEffect`.
- Never put `materials.length` in a `useEffect` dependency array to trigger re-fetches.

---

## 7. `useMemo` Rules for Project Data

```tsx
// CORRECT: read projectCosts from context, derive a view-specific subset
const laborItems = useMemo(
  () => projectCosts.lineItems.filter(i => i.isLabor),
  [projectCosts.lineItems],
);

// CORRECT: derive a section total from already-computed lineItems
const wallFramingTotal = useMemo(
  () => projectCosts.lineItems
    .filter(i => i.trade === 'Interior Walls')
    .reduce((s, i) => s + i.totalCost, 0),
  [projectCosts.lineItems],
);

// WRONG: re-aggregating from raw costing data in a component
const laborTotal = useMemo(
  () => materialCostingData.flatMap(a => a.materials_costing).reduce(...),
  [materialCostingData],
);
// ↑ This creates a DIFFERENT total than what projectCosts shows — it's a bug.
```

---

## 8. The `refresh()` Pattern

`refresh()` is the only way to reload project data after a mutation:

```ts
// After pipeline completes:
const { refresh } = useProjectDataContext();
onPipelineComplete={() => refresh()}

// After assembly is saved via API:
await saveAssembly(updatedAssembly);
refresh();  // re-fetches all project data from scratch

// Do NOT do this — creates a cascading re-render:
setAssemblyDataRefreshTrigger(prev => prev + 1);
```

**Rules:**
- `refresh()` fetches BOTH assembly-data and overrides endpoints — it always returns a consistent snapshot.
- Only call `refresh()` after a write operation — never call it on a timer or on tab switch.
- Never set a counter state to trigger re-renders — call `refresh()` explicitly.

---

## 9. What NOT to Do

- **Never** add `useEffect(() => { fetch('/api/X') }, [someData])` in a feature component — use the hook.
- **Never** store server-fetched data in `localStorage` or `sessionStorage` — context is the cache.
- **Never** pass `materialCostingData` as a prop through 3+ levels — consume from context.
- **Never** call `aggregateProjectCosts()` in a component — only `useProjectData` calls it.
- **Never** apply overrides manually (`applyProjectCostingOverrides(data, overrideMap)`) — overrides are baked into `aggregateProjectCosts`.
- **Never** use `useRef` as a workaround for stale state — the context already ensures fresh data.

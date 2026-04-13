# Claude Code Instructions — PlanckOff Drywall Estimator

## Project Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 3.4
- **Database:** Supabase (PostgreSQL)
- **State:** React Context + useLocalStorage
- **Icons:** lucide-react only
- **Auth:** Custom session cookies + bcrypt + RBAC

---

## MANDATORY: Read the Rule File Before Writing Any Code

Before writing or editing any code, you MUST read the relevant rule file listed below.
Do not guess conventions — always read the rule file first, then code.

### If the task involves UI, components, layout, styling, modals, forms, tables, icons, or loading states:
→ **READ `.claude/rules/frontend.md` before writing a single line of code.**

Examples that trigger this:
- "Add a modal for X"
- "Create a new component"
- "Change the layout / colors / spacing"
- "Add a button / table / form / dropdown"
- "Show a toast / loading spinner / empty state"
- "Fix the UI for X"

### If the task involves API routes, business logic, authentication, or services:
→ **READ `.claude/rules/backend.md` before writing a single line of code.**

Examples that trigger this:
- "Create an API endpoint for X"
- "Add auth / role check to a route"
- "Write logic in `src/lib/` or `src/services/`"
- "Handle a form submission on the server"
- "Add caching / error handling to an API"

### If the task involves Supabase queries, repositories, or schema:
→ **READ `.claude/rules/database.md` before writing a single line of code.**

Examples that trigger this:
- "Query the database for X"
- "Add a new table or column"
- "Write a repository function"
- "Fetch or save data to Supabase"

### If the task involves TypeScript types, utility functions, or constants:
→ **READ `.claude/rules/typescript.md` before writing a single line of code.**

Examples that trigger this:
- "Add a new type or interface"
- "Write a utility/helper function"
- "Add a constant"
- "Refactor types in `src/types/`"

### If the task involves data fetching, context, hooks, overrides, or how project data flows to components:
→ **READ `.claude/rules/state-management.md` before writing a single line of code.**

Examples that trigger this:
- "Add a `useEffect` that fetches data"
- "Create a new hook for project data"
- "Why isn't the override updating in the Markups tab?"
- "How does `materialCostingData` get into the Reports component?"
- "The component is re-fetching too often"
- "Move fetching logic out of the component"
- Touching `AppContext.tsx`, `ProjectDataContext.tsx`, `useProjectData.ts`, `useCurrentUser.ts`
- Any `useEffect` that calls `fetch()`

### If the task involves the AI pipeline, `ImportFilesModal`, pipeline routes, or `PipelineContext`:
→ **READ `.claude/rules/pipeline.md` before writing a single line of code.**

Examples that trigger this:
- "Add a step to the pipeline"
- "Show progress during the pipeline run"
- "The extract / match / finalize step is failing"
- "Change the AI prompt for extraction"
- "Add retry for a failed pipeline step"
- Touching `/api/extract`, `/api/match`, `/api/finalize`, `/api/parse-takeoff`
- Touching `ImportFilesModal.tsx`, `PipelineContext.tsx`, or any file in `src/services/`

### If the task involves the Markups tab, General Requirements (Division 01), or any section under `src/components/features/reports/markups/`:
→ **READ `.claude/rules/markups-general-requirements.md` before writing a single line of code.**

Examples that trigger this:
- "Add a new section to General Requirements"
- "Add a formula-driven row or table to the Markups tab"
- "Change how staffing / supervision is calculated"
- "Add equipment, subcontractor, or any other GC section"
- "Modify ProjectInfoPanel or StaffingSection"
- "Change how durationWeeks flows into GC calculations"

### If the task involves ANY number that is a cost, quantity, total, or markup — anywhere in the app:
→ **READ `.claude/rules/calculations.md` before writing a single line of code.**

This rule applies even if the task looks like a "simple UI change". If a component renders a dollar value or quantity, the calculation rule applies.

Examples that trigger this:
- "Fix the labour total in the Markups tab"
- "The total on the Labour tab doesn't match the Markups tab"
- "Add a new cost breakdown / summary panel"
- "Change how material cost is calculated"
- "Add escalation / tax / overhead / profit / burden"
- "Show the project total anywhere"
- "A number looks wrong in the UI"
- "Add a useMemo that sums costs"
- Touching `Reports.tsx`, `Markups.tsx`, `LaborView.tsx`, `MatLabView.tsx`, `MaterialsView.tsx`
- Touching `calculationUtils.ts`, `aggregateMaterialsFromCosting.ts`, `projectCosting.ts`, `markupChain.ts`, or any `calc*` function
- Any `reduce()` that accumulates cost or quantity values

### Most tasks touch multiple layers — read all relevant rule files.
Example: "Add a form that saves to the database" → read `frontend.md` + `backend.md` + `database.md`.
Example: "Fix the total shown in the Markups tab" → read `calculations.md` + `frontend.md` + `markups-general-requirements.md`.

---

## Critical Project-Wide Rules (Always Apply)

1. **Never write raw Tailwind one-offs** — use only the color tokens and spacing defined in `frontend.md`.
2. **Never query Supabase directly in a component or API route** — always go through a repository in `src/lib/db/`.
3. **Never create a new UI primitive** — reuse from `src/components/ui/`. Only add if genuinely missing.
4. **Never write a new API route without `withAuth` or `withRoleAuth`** — there are no public endpoints.
5. **Never use `any` in TypeScript** — use proper types from `src/types/`.
6. **Always use `@/` path alias** — never use relative paths like `../../components`.
7. **Never compute the same cost/total in more than one place** — every calculated value has ONE canonical function in `src/lib/utils/`. All components read that function's output. Duplicate formulas are bugs. See `calculations.md`.
8. **Never use `Math.round()` or `toFixed()` on intermediate calculation results** — format only at the final display layer.
9. **Never let a filter change a total that is shared across tabs** — filters are view-only unless explicitly designed otherwise.

---

## Key File Locations

```
src/
├── app/api/             ← API routes (one folder per domain)
├── app/(protected)/     ← All authenticated pages
├── components/ui/       ← Shared UI primitives (always reuse these)
├── components/features/ ← Domain feature components
├── context/             ← AppContext, AuthContext, PipelineContext
├── hooks/               ← useRBAC, useLocalStorage, domain hooks
├── lib/
│   ├── auth/            ← withAuth, withRoleAuth, validateSession
│   ├── db/              ← All Supabase queries (repository pattern)
│   ├── api/             ← ApiResponse helpers, cookie utils
│   ├── supabase/        ← client.ts (browser), server.ts (admin)
│   └── utils/           ← formulaEvaluator, calculationUtils, etc.
├── services/            ← AI integrations, pipeline orchestration
├── types/               ← index.ts (core), auth.ts, team.ts, takeoff.ts
└── constants/           ← All app constants, formulas, defaults
```

## Key Hooks and Contexts (Always Use These)

| Need | Hook / Context | File |
|------|---------------|------|
| Current user + role | `useCurrentUser()` | `src/hooks/useCurrentUser.ts` |
| Project assemblies + costing + costs | `useProjectDataContext()` | `src/context/ProjectDataContext.tsx` |
| Global materials list | `useMaterials()` | `src/context/AppContext.tsx` |
| Pipeline progress + open modal | `usePipeline()` | `src/context/PipelineContext.tsx` |
| Role checks | `useRBAC()` | `src/hooks/useRBAC.ts` |

---

## Dependency Rules

### Confirmed Unused (remove if present)
- `@google/genai` — newer Google AI SDK, never imported anywhere. Remove from `package.json`.

### Legacy (do not expand usage)
- `@google/generative-ai` — used only in `/api/gemini/route.ts` (legacy path, will be removed in Pillar 4 cleanup). Do not import this in new files.

### Pinning
- `xlsx` must be pinned to a specific version — never use `"latest"`. Check `package.json`.
- `@types/uuid` belongs in `devDependencies`, not `dependencies`.

### Adding New Dependencies
Before adding any new `npm` package:
1. Check if the use case can be satisfied by a package already in `package.json`.
2. Check if a built-in (`crypto`, `fs`, `path`) covers the need.
3. If a new package is truly needed, add it with an exact version (no `^` or `~` for production deps).
4. Never add UI libraries (no `shadcn`, `radix`, `headless-ui`, `react-select`) — use `src/components/ui/`.
5. Never add state management libraries (no Redux, Zustand, Jotai) — use React Context.

---

## UI Standards (Always Consistent)

### Page-level layout
```tsx
// Every page inside app/(protected)/(app)/ follows this wrapper:
<div className="p-6 flex flex-col gap-6 h-full">
  {/* Page header */}
  <div className="flex items-center justify-between">
    <h1 className="text-lg font-bold text-slate-900">Page Title</h1>
    {/* Optional action buttons */}
  </div>
  {/* Page content */}
</div>
```

### Tab navigation
Every multi-tab feature uses this exact pattern — no exceptions:
```tsx
type TabId = 'general' | 'specs' | 'formulas';
const [activeTab, setActiveTab] = useState<TabId>('general');

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'specs', label: 'Specs' },
  { id: 'formulas', label: 'Formulas' },
];

// Tab bar:
<div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
  {TABS.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        activeTab === tab.id
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Section headers inside panels
```tsx
// Primary section header (e.g. "Staffing", "Materials")
<div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
  <h3 className="text-sm font-semibold text-slate-800">Section Title</h3>
  {/* Optional badge or action */}
</div>

// Sub-section header (e.g. inside a table block)
<h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
  Sub-section
</h4>
```

### Cost / number display
- Always use `tabular-nums` className on cells showing numbers.
- Format costs at display layer only: `value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- Show `—` (em dash) when a numeric value is zero and no user input has been made.
- Currency prefix `$` is a separate `<span className="text-slate-400 text-xs mr-0.5">$</span>`.

---

## Current Development Phase
See `REFACTOR_PLAN.md` for the 4-pillar refactoring roadmap. See `docs/WALL_ASSEMBLY_GUIDE.md` for assembly phase tracking.

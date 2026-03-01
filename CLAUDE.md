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

### Most tasks touch multiple layers — read all relevant rule files.
Example: "Add a form that saves to the database" → read `frontend.md` + `backend.md` + `database.md`.

---

## Critical Project-Wide Rules (Always Apply)

1. **Never write raw Tailwind one-offs** — use only the color tokens and spacing defined in `frontend.md`.
2. **Never query Supabase directly in a component or API route** — always go through a repository in `src/lib/db/`.
3. **Never create a new UI primitive** — reuse from `src/components/ui/`. Only add if genuinely missing.
4. **Never write a new API route without `withAuth` or `withRoleAuth`** — there are no public endpoints.
5. **Never use `any` in TypeScript** — use proper types from `src/types/`.
6. **Always use `@/` path alias** — never use relative paths like `../../components`.

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

## Current Development Phase
See `docs/WALL_ASSEMBLY_GUIDE.md` for phase tracking and `docs/PHASE_X_TEST.md` for test plans.

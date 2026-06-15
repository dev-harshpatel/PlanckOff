# Backend Rules — API Routes, Business Logic, Services

Consult this file for: API routes in `src/app/api/`, business logic in `src/lib/`, service integrations in `src/services/`, authentication, error handling.

---

## 1. API Route Structure

Every API route lives in `src/app/api/<domain>/route.ts`.

### File Template
```ts
// src/app/api/assemblies/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRoleAuth } from '@/lib/auth/api-helpers';
import { success, failure } from '@/lib/api/response';
import { getAllAssemblies, createAssembly } from '@/lib/db/assemblies';

// Public to all authenticated users
export const GET = withAuth(async (request: NextRequest) => {
  const { data, error } = await getAllAssemblies();
  if (error) return failure(error.message, 500);
  return success(data);
});

// Restricted to Administrator and Team Lead
export const POST = withRoleAuth(['Administrator', 'Team Lead'], async (request: NextRequest) => {
  const body = await request.json();
  // validate, then call repository
  const { data, error } = await createAssembly(body);
  if (error) return failure(error.message, 400);
  return success(data, 201);
});
```

### Rules
- **One file per HTTP method group** — GET and POST in the same `route.ts` when they share the same base URL.
- **One folder per domain** — `api/materials/`, `api/team/`, `api/projects/`, etc.
- For a single resource by ID: `api/materials/[code]/route.ts`.
- Always `export const GET = ...`, `export const POST = ...` (named exports for each HTTP verb).
- Route files contain only routing logic — no business logic, no direct DB queries.

---

## 2. Authentication Wrappers — Always Required

**There are no public API endpoints. Every route must be wrapped.**

```ts
import { withAuth, withRoleAuth } from '@/lib/auth/api-helpers';

// Option A: Any authenticated user
export const GET = withAuth(async (request, { user, teamMember }) => {
  // user.id, user.email, teamMember.role available here
});

// Option B: Specific roles only
export const POST = withRoleAuth(['Administrator'], async (request, { user }) => {
  // Only Administrators reach this handler
});

export const DELETE = withRoleAuth(['Administrator', 'Team Lead'], async (request, { user }) => {
  // Administrators and Team Leads only
});
```

**Role hierarchy:** Administrator > Team Lead > Estimator

**Never validate sessions manually** — the HOFs handle it. If `withAuth` or `withRoleAuth` is unavailable for a legitimate reason, use `validateSession()` from `@/lib/auth/session` and check `session.isValid`.

---

## 3. Standard Response Format

**Always use the helpers from `@/lib/api/response`.** Never write raw `NextResponse.json()` unless the helper doesn't cover the case.

```ts
import { success, failure } from '@/lib/api/response';

// Success with data
return success(data);           // 200
return success(data, 201);      // 201 Created

// Failure with message
return failure('Not found', 404);
return failure('Validation failed', 400);
return failure('Internal server error', 500);
```

The helpers produce:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "message", "code": "optional_code" }
```

If the helper function does not exist yet, create it in `src/lib/api/response.ts` following the `ApiResponse<T>` interface from `src/types/`.

---

## 4. Input Validation

Validate at the route level before passing to the repository.

```ts
export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => null);

  // 1. Check body is parseable
  if (!body) return failure('Invalid JSON body', 400);

  // 2. Check required fields
  const { name, type, cost } = body;
  if (!name || typeof name !== 'string') return failure('name is required', 400);
  if (!type) return failure('type is required', 400);
  if (cost !== undefined && typeof cost !== 'number') return failure('cost must be a number', 400);

  // 3. Pass clean data to repository
  const { data, error } = await createMaterial({ name: name.trim(), type, cost });
  if (error) return failure(error.message, 400);
  return success(data, 201);
});
```

Rules:
- Trim strings before saving.
- Never trust client-provided IDs for authorization decisions.
- Check required vs optional fields explicitly — do not rely on DB constraints to catch missing fields.

---

## 5. Error Handling

```ts
// Always wrap async DB or external calls in try-catch at the service layer
// (repositories already return { data, error } — no try-catch needed in routes for those)

// For third-party API calls (Gemini, OpenRouter):
try {
  const result = await callExternalService(params);
  return success(result);
} catch (err) {
  const message = err instanceof Error ? err.message : 'External service failed';
  return failure(message, 502);
}
```

Rules:
- **Never let an unhandled exception reach the client.** Always wrap external calls in try-catch.
- Supabase repository calls return `{ data, error }` — check `error` before using `data`.
- Log server errors with `console.error` (structured, not `console.log`). Do not log sensitive data.
- Return meaningful HTTP status codes: 400 for client error, 401/403 for auth, 404 for not found, 500/502 for server errors.

---

## 6. Service Layer vs Repository Layer

```
API Route (routing + validation + auth)
   ↓
Service Layer (business logic orchestration) — src/services/
   ↓
Repository Layer (DB access) — src/lib/db/
```

- **Repository** (`src/lib/db/`): CRUD only. No business logic. Returns `{ data, error }`.
- **Service** (`src/services/`): Orchestrates multiple repositories, external APIs, or complex calculations. Returns typed results.
- **API Route**: Calls service or (for simple CRUD) calls repository directly. Handles auth + response formatting.

Do NOT put business logic in routes. Do NOT put DB queries in services without going through a repository.

---

## 7. Role-Based Access Control (RBAC)

Roles in order of access level:
1. `Administrator` — full access
2. `Team Lead` — team management, project access
3. `Estimator` — project access only

```ts
// Checking roles
import { hasRoleAccess } from '@/lib/auth/rbac';

// In a service or utility (not in a route — use withRoleAuth there)
if (!hasRoleAccess(userRole, 'Team Lead')) {
  throw new Error('Insufficient permissions');
}
```

On the client side:
```tsx
import { useRBAC } from '@/hooks/useRBAC';
const { isAdmin, hasMinRole } = useRBAC();
```

---

## 8. Environment Variables

```ts
// Server-side only (API routes, lib/):
process.env.SUPABASE_SERVICE_ROLE_KEY  // Never expose client-side
process.env.GEMINI_API_KEY
process.env.OPENROUTER_API_KEY

// Client-side safe (prefixed with NEXT_PUBLIC_):
process.env.NEXT_PUBLIC_SUPABASE_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- Never expose server-only env vars to the client.
- Always access `process.env` directly — no helper wrappers needed.
- If an env var is required and missing, throw early with a clear error message.

---

## 9. Caching

The project uses `@upstash/redis` for caching expensive operations.

```ts
import { redis } from '@/lib/cache';

const cacheKey = `materials:all`;
const cached = await redis.get(cacheKey);
if (cached) return success(cached);

const { data, error } = await getAllMaterials();
if (error) return failure(error.message, 500);

await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min TTL
return success(data);
```

- Cache at the API route level, not the repository level.
- Use namespaced keys: `<domain>:<identifier>`.
- Always invalidate cache on mutating operations (POST, PUT, DELETE).
- Set reasonable TTLs — 5 minutes for reference data, no caching for user-specific data.

---

## 10. Constants

All application constants live in `src/constants/`. Never hardcode values that are used in more than one place.

```ts
import { ROLES } from '@/constants/roles';
import { PROJECT_STATUS } from '@/constants/project';
import { DEFAULT_WASTE_FACTOR } from '@/constants';
```

If adding a new constant:
- Add it to the appropriate file in `src/constants/`.
- Export it from the barrel if used widely.
- Use `UPPER_SNAKE_CASE` for scalar constants, `PascalCase` for constant objects/arrays.

---

## 11. Do Not Do

- Do NOT write `export default` in API route files — Next.js App Router requires named method exports.
- Do NOT add middleware outside of `src/lib/auth/api-helpers.ts` — centralize auth logic there.
- Do NOT catch errors and then silently swallow them (no empty `catch {}` blocks).
- Do NOT use `fetch` inside server-side API routes to call other API routes in the same app — call the repository or service directly.
- Do NOT hardcode role names as strings in route files — import from `@/constants/roles`.
- Do NOT put `console.log` in committed code. Use `console.error` for actual errors only.

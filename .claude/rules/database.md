# Database Rules — Supabase, Repositories, Schema

Consult this file for: writing Supabase queries, adding/modifying repository functions in `src/lib/db/`, schema changes, field naming conventions, data transformations.

---

## 1. Repository Pattern — The Only Way to Query

**Every table has one dedicated repository file in `src/lib/db/`.**

- `src/lib/db/materials.ts` → `spec_database` table
- `src/lib/db/auth.ts` → `admins` + `auth_sessions` tables
- `src/lib/db/team.ts` → `team_members` + `roles` tables
- `src/lib/db/project.ts` → `projects` table

**Never query Supabase outside a repository file.** API routes and services call repository functions — they do not import Supabase directly.

### Repository File Template
```ts
// src/lib/db/assemblies.ts
import { supabaseAdmin } from '@/lib/supabase/server';
import type { Assembly } from '@/types';

// ─── Transformers ────────────────────────────────────────────────────────────

const toAssembly = (row: Record<string, unknown>): Assembly => ({
  id: row.id as string,
  name: row.name as string,
  code: row.code as string,
  createdAt: row.created_at as string,
  // ...map all snake_case DB fields to camelCase TS fields
});

const toDbRow = (assembly: Partial<Assembly>) => ({
  name: assembly.name,
  code: assembly.code,
  // ...map camelCase to snake_case
});

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getAllAssemblies(): Promise<{
  data: Assembly[] | null;
  error: { message: string; code?: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assemblies')
    .select('*')
    .order('code', { ascending: true });

  if (error) return { data: null, error: { message: error.message, code: error.code } };
  return { data: data.map(toAssembly), error: null };
}

export async function getAssemblyById(id: string): Promise<{
  data: Assembly | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assemblies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toAssembly(data), error: null };
}

export async function createAssembly(input: Omit<Assembly, 'id' | 'createdAt'>): Promise<{
  data: Assembly | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assemblies')
    .insert(toDbRow(input))
    .select()
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toAssembly(data), error: null };
}

export async function updateAssembly(id: string, updates: Partial<Assembly>): Promise<{
  data: Assembly | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('assemblies')
    .update(toDbRow(updates))
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: { message: error.message } };
  return { data: toAssembly(data), error: null };
}

export async function deleteAssembly(id: string): Promise<{
  error: { message: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from('assemblies')
    .delete()
    .eq('id', id);

  return { error: error ? { message: error.message } : null };
}
```

---

## 2. Supabase Client Usage

```ts
// For server-side code (API routes, lib/db/, services):
import { supabaseAdmin } from '@/lib/supabase/server';
// Uses service role key — bypasses RLS. Use for all server operations.

// For client-side code (React components, if ever needed):
import { supabase } from '@/lib/supabase/client';
// Uses anon key — respects RLS. Use sparingly; prefer API routes.
```

**Always use `supabaseAdmin` in API routes and repositories** — this is the service role client that has full DB access. Never use the anon client server-side.

---

## 3. Field Naming Convention

| Layer | Convention | Example |
|-------|-----------|---------|
| TypeScript types | `camelCase` | `matCost`, `hourlyRate`, `createdAt` |
| Database columns | `snake_case` | `mat_cost`, `hourly_rate`, `created_at` |
| JSON API response | `camelCase` | `matCost`, `hourlyRate` |

**Transformers are mandatory.** Every repository must have `toType()` and `toDbRow()` functions that convert between these conventions. Never expose raw DB rows to the application layer.

---

## 4. Return Type Convention

All repository functions return `{ data, error }` — never throw exceptions.

```ts
// Always this shape:
Promise<{ data: T | null; error: { message: string; code?: string } | null }>

// For delete (no data returned):
Promise<{ error: { message: string } | null }>

// For count queries:
Promise<{ count: number | null; error: { message: string } | null }>
```

**Callers always check `error` before using `data`:**
```ts
const { data, error } = await getAllMaterials();
if (error) return failure(error.message, 500);
// data is guaranteed non-null here
```

---

## 5. Query Patterns

### Filtering
```ts
// Single condition
.eq('status', 'active')
.neq('status', 'deleted')

// Multiple conditions (AND)
.eq('role', 'Administrator')
.eq('status', 'active')

// In list
.in('status', ['active', 'invited'])

// Text search
.ilike('name', `%${searchTerm}%`)

// Null checks
.is('deleted_at', null)
.not('deleted_at', 'is', null)

// Range
.gte('created_at', startDate)
.lte('created_at', endDate)
```

### Ordering and Pagination
```ts
.order('created_at', { ascending: false })
.order('name', { ascending: true })

// Pagination (0-indexed)
.range(offset, offset + limit - 1)
```

### Selecting specific columns
```ts
// Only fetch what you need for list views
.select('id, name, code, status')

// Full record for detail views
.select('*')

// Join related table
.select('*, roles(name, permissions)')
```

### Single record
```ts
// Use .single() when you expect exactly one row
.eq('id', id).single()
// Returns error if 0 or more than 1 row

// Use .maybeSingle() when 0 rows is acceptable
.eq('email', email).maybeSingle()
// Returns null data (not error) if 0 rows
```

### Upsert
```ts
// Insert or update based on unique constraint
const { data, error } = await supabaseAdmin
  .from('spec_database')
  .upsert(rows, { onConflict: 'code' })  // 'code' is the unique column
  .select();
```

---

## 6. Bulk Operations

```ts
// Bulk insert
const { data, error } = await supabaseAdmin
  .from('spec_database')
  .insert(rows)  // rows is an array
  .select();

// Bulk upsert (used for material import)
const { data, error } = await supabaseAdmin
  .from('spec_database')
  .upsert(rows, { onConflict: 'code' })
  .select();

// Bulk delete by condition
const { error } = await supabaseAdmin
  .from('spec_database')
  .delete()
  .in('code', codesToDelete);
```

For large imports (>500 rows), batch in chunks:
```ts
const CHUNK_SIZE = 500;
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  const chunk = rows.slice(i, i + CHUNK_SIZE);
  const { error } = await supabaseAdmin.from('spec_database').upsert(chunk, { onConflict: 'code' });
  if (error) return { error: { message: error.message } };
}
```

---

## 7. Table Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `spec_database` | Material definitions | `code` (PK), `description`, `mat_cost`, `unit_cost`, `type`, `category` |
| `auth_sessions` | User sessions | `id`, `admin_id`, `token`, `expires_at`, `ip_address` |
| `admins` | Legacy admin users | `id`, `email`, `password_hash`, `name`, `role` |
| `team_members` | Team users | `id`, `email`, `password_hash`, `name`, `role_id`, `status`, `invited_by` |
| `roles` | Role definitions | `id`, `name`, `permissions` |
| `projects` | Project records | `id`, `name`, `status`, `created_by`, `created_at` |

When adding a new table:
1. Create migration in `supabase/migrations/`
2. Create corresponding repository in `src/lib/db/<table>.ts`
3. Add TypeScript type in `src/types/`
4. Never add columns directly in the Supabase dashboard without a migration file

---

## 8. Data Validation Before DB Write

Always validate/sanitize data in the API route layer before calling the repository. The repository assumes data is already validated.

```ts
// In API route:
const { name, cost } = body;
if (!name?.trim()) return failure('name is required', 400);
if (typeof cost !== 'number' || cost < 0) return failure('cost must be a non-negative number', 400);

// Repository call with clean data:
await createMaterial({ name: name.trim(), cost });
```

---

## 9. Sensitive Data

- **Passwords:** Always hash with bcrypt before storing. Never store plaintext.
  ```ts
  import bcrypt from 'bcryptjs';
  const hash = await bcrypt.hash(password, 12);  // salt rounds: 12
  const valid = await bcrypt.compare(plaintext, hash);
  ```
- **Tokens/secrets:** Never select `password_hash` columns in list queries. Only fetch when explicitly needed for auth verification.
- **Session tokens:** Use `uuid()` for token generation. Store in `auth_sessions` with expiry.

---

## 10. Do Not Do

- Do NOT write Supabase queries directly in API routes, components, or services.
- Do NOT use `.select('*')` for list endpoints that return many rows — select only needed columns.
- Do NOT rely on Supabase RLS policies for server-side security — the service role key bypasses RLS, so enforce access control in `withAuth`/`withRoleAuth`.
- Do NOT use `.throwOnError()` — the project pattern is `{ data, error }` destructuring.
- Do NOT hardcode table names as strings in multiple places — if a query is reused, add it to the repository.
- Do NOT commit schema changes without a matching migration file in `supabase/migrations/`.
- Do NOT expose `supabaseAdmin` (service role) to client-side code.

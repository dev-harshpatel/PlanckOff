# TypeScript Rules — Types, Utilities, Constants

Consult this file for: defining types in `src/types/`, writing utility functions in `src/lib/utils/`, adding constants in `src/constants/`, general TypeScript conventions.

---

## 1. Type Definitions

### Where to put types
| Type | Location |
|------|---------|
| Core domain types (Material, Assembly, Takeoff) | `src/types/index.ts` |
| Auth types (Admin, Session, Credentials) | `src/types/auth.ts` |
| Team types (TeamMember, Role, Invitation) | `src/types/team.ts` |
| Takeoff types (TakeoffInstance, Schedule) | `src/types/takeoff.ts` |
| Feature-specific local types | Top of the feature file (not exported) |

### Interface vs Type
```ts
// Use interface for object shapes (extensible, readable error messages)
interface MaterialDefinition {
  code: string;
  description: string;
  matCost: number;
  unitCost: number;
  per: string;
  category: string;
}

// Use type for unions, intersections, and utility compositions
type CalculationMethod =
  | 'Vertical @ 12" OC'
  | 'Coverage (1 Layer)'
  | 'Custom Formula'
  | 'Area (SF)';

type MaterialWithStatus = MaterialDefinition & { isSelected: boolean };

type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  code?: string;
};
```

### Extending Types
```ts
// Prefer composition over deep inheritance
interface TeamMemberWithRole extends TeamMember {
  role: Role;
}

// Omit fields that aren't relevant
type CreateMaterialInput = Omit<MaterialDefinition, 'id' | 'createdAt'>;

// Pick the fields you need for a specific context
type MaterialListItem = Pick<MaterialDefinition, 'code' | 'description' | 'matCost' | 'category'>;
```

### Enums
Only use `const` assertions or union types instead of TypeScript enums (enums have runtime overhead):
```ts
// Preferred: const object + type
const APP_STATE = {
  IDLE: 'IDLE',
  ANALYZING: 'ANALYZING',
  ESTIMATING: 'ESTIMATING',
  ERROR: 'ERROR',
} as const;

type AppState = typeof APP_STATE[keyof typeof APP_STATE];

// Also acceptable for simple cases: string union type
type AppState = 'IDLE' | 'ANALYZING' | 'ESTIMATING' | 'ERROR';
```

---

## 2. Strict TypeScript — No Shortcuts

The project runs with `strict: true`. Obey all strict rules.

```ts
// NEVER use any
const data: any = ...; // forbidden

// Use unknown for truly unknown types, then narrow
function processInput(input: unknown) {
  if (typeof input === 'string') {
    return input.toUpperCase(); // narrowed
  }
}

// Use Record<string, X> for dynamic object keys
const cache: Record<string, MaterialDefinition> = {};

// Use proper generics
function getFirst<T>(items: T[]): T | undefined {
  return items[0];
}

// Use non-null assertion ONLY when you are 100% certain — prefer optional chaining
const name = user!.name;  // avoid unless absolutely necessary
const name = user?.name ?? 'Unknown'; // preferred
```

---

## 3. Null and Undefined Handling

```ts
// Optional fields in interfaces
interface Assembly {
  id: string;
  name: string;
  description?: string;  // can be undefined
  height: number | null; // can be null (DB nullable)
}

// Narrowing before use
if (assembly.description !== undefined) {
  console.log(assembly.description.toUpperCase()); // safe
}

// Nullish coalescing for defaults
const height = assembly.height ?? 0;
const label = assembly.description ?? 'No description';

// Optional chaining for nested access
const roleName = teamMember?.role?.name ?? 'Unknown';
```

---

## 4. Utility Functions

### Location and structure
All utilities go in `src/lib/utils/`. Group by domain:
- `calculationUtils.ts` — math and estimation calculations
- `formulaEvaluator.ts` — formula parsing and evaluation
- `assemblyJsonMapper.ts` — assembly data transformation
- `materialValidation.ts` — material data validation

### Template
```ts
// src/lib/utils/myUtils.ts

/**
 * One-line description of what this does.
 */
export function calculateWastage(quantity: number, wasteFactor: number): number {
  if (wasteFactor < 0 || wasteFactor > 1) {
    throw new Error(`wasteFactor must be between 0 and 1, got ${wasteFactor}`);
  }
  return quantity * (1 + wasteFactor);
}

/**
 * Returns null if input is invalid instead of throwing.
 * Prefer this pattern for UI-facing utilities.
 */
export function parseCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}
```

### Rules
- Pure functions — no side effects in utilities. No direct API calls.
- Validate inputs and either throw with descriptive messages or return `null`/`undefined` for invalid cases.
- Export each function individually (no default exports from utility files).
- Add a JSDoc comment for any non-obvious function.
- Do NOT add utility functions that are used in only one place — keep them local to that file.

---

## 5. Constants

### Location
`src/constants/` — one file per domain:
- `index.ts` — general app constants
- `auth.ts` — auth-related constants (session expiry, cookie names)
- `roles.ts` — role names and hierarchy
- `project.ts` — project status values
- `formulas.ts` — formula templates and variable names
- `defaultAssemblies.ts` — default assembly templates

### Convention
```ts
// UPPER_SNAKE_CASE for primitive constants
export const SESSION_EXPIRY_DAYS = 7;
export const MAX_FILE_SIZE_MB = 50;
export const COOKIE_NAME = 'auth_session';

// PascalCase for objects and arrays
export const ROLES = {
  ADMINISTRATOR: 'Administrator',
  TEAM_LEAD: 'Team Lead',
  ESTIMATOR: 'Estimator',
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];

// Arrays of valid values
export const VALID_MATERIAL_TYPES = ['Board', 'Framing', 'Fastener', 'Tape', 'Compound', 'Insulation'] as const;
export type MaterialType = typeof VALID_MATERIAL_TYPES[number];
```

---

## 6. Generics Patterns

```ts
// Repository return type (reusable)
type DbResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

// Usage
async function getMaterials(): Promise<DbResult<MaterialDefinition[]>> { ... }
async function getTeamMember(id: string): Promise<DbResult<TeamMember>> { ... }

// Component prop with generic children
interface TableProps<T extends { id: string }> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
}
```

---

## 7. Type Guards and Narrowing

```ts
// Type guard function
function isMaterialDefinition(value: unknown): value is MaterialDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'description' in value &&
    typeof (value as MaterialDefinition).code === 'string'
  );
}

// Discriminated union narrowing
type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

function handleResponse<T>(res: ApiResponse<T>): T {
  if (!res.success) throw new Error(res.error); // TypeScript knows res.error exists here
  return res.data; // TypeScript knows res.data exists here
}
```

---

## 8. Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Interface/Type | PascalCase | `MaterialDefinition`, `ApiResponse<T>` |
| Component | PascalCase | `AssemblyEditorModal` |
| Function | camelCase | `getAllMaterials`, `calculateWastage` |
| Variable | camelCase | `matCost`, `selectedRow` |
| Constant (primitive) | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `SESSION_EXPIRY_DAYS` |
| Constant (object) | PascalCase | `ROLES`, `APP_STATE` |
| Hook | `use` prefix, camelCase | `useRBAC`, `useMaterials` |
| Context | PascalCase + `Context` | `AppContext`, `AuthContext` |
| Enum-like const | PascalCase | `ROLES.ADMINISTRATOR` |
| Database field (TS) | camelCase | `createdAt`, `matCost` |
| Database column (SQL) | snake_case | `created_at`, `mat_cost` |

---

## 9. Import Order Convention

Organize imports in this order (with a blank line between groups):

```ts
// 1. React and Next.js
import { useState, useCallback, useEffect } from 'react';
import { NextRequest, NextResponse } from 'next/server';

// 2. Third-party libraries
import { Trash2, Plus } from 'lucide-react';
import bcrypt from 'bcryptjs';

// 3. Internal — context and hooks
import { useAuth } from '@/context/AuthContext';
import { useRBAC } from '@/hooks/useRBAC';

// 4. Internal — components
import { Button, Modal, ModalBody } from '@/components/ui';

// 5. Internal — lib (auth, db, utils, api)
import { withAuth } from '@/lib/auth/api-helpers';
import { getAllMaterials } from '@/lib/db/materials';

// 6. Internal — types and constants
import type { MaterialDefinition } from '@/types';
import { ROLES } from '@/constants/roles';
```

---

## 10. Do Not Do

- Do NOT use `any` — ever. Use `unknown` + narrowing, or proper generics.
- Do NOT use `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why.
- Do NOT create redundant type aliases: `type Name = string` adds no value.
- Do NOT export types from feature component files — put them in `src/types/` if shared.
- Do NOT use `namespace` — keep everything in modules.
- Do NOT use `!` (non-null assertion) unless the non-null is logically guaranteed and you add a comment explaining why.
- Do NOT use `as unknown as X` type casting — redesign the types instead.

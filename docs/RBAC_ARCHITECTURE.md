# Role-Based Access Control (RBAC) Architecture

This document explains the modular RBAC system implemented in PlanckOff.

## Overview

The RBAC system provides:
1. **Server-side protection** - Middleware and API route wrappers
2. **Client-side protection** - React hooks and RouteGuard component
3. **Centralized configuration** - Easy to add/modify routes and permissions

## Architecture

```
src/
├── lib/auth/
│   ├── index.ts           # Main exports
│   ├── session.ts         # Session validation helpers
│   ├── rbac.ts           # Role permissions configuration
│   └── api-helpers.ts    # API route wrappers (withAuth, withRoleAuth)
├── hooks/
│   ├── index.ts
│   └── useRBAC.ts        # Client-side RBAC hook
├── components/auth/
│   ├── index.ts
│   └── RouteGuard.tsx    # Client-side route protection
└── middleware.ts          # Next.js middleware for server-side protection
```

## Role Hierarchy

```
Administrator (Level 1) - Highest authority
    └── Team Lead (Level 2)
            └── Estimator (Level 3) - Lowest authority
```

## How to Use

### 1. Protecting API Routes

Use `withAuth` for routes that just need authentication:

```typescript
// src/app/api/some-route/route.ts
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (request, { user, teamMember }) => {
  // user is guaranteed to be authenticated
  return NextResponse.json({ success: true, user });
});
```

Use `withRoleAuth` for routes that need specific roles:

```typescript
// src/app/api/admin/route.ts
import { withRoleAuth } from '@/lib/auth';

export const GET = withRoleAuth(
  ['Administrator'],  // Only admins
  async (request, { user }) => {
    return NextResponse.json({ success: true });
  }
);
```

### 2. Protecting Pages (Client-side)

Use `RouteGuard` component:

```tsx
// src/app/(protected)/admin/page.tsx
"use client";

import { RouteGuard } from "@/components/auth";
import { AdminPanel } from "@/components/features/admin";

export default function AdminPage() {
  return (
    <RouteGuard allowedRoles={["Administrator"]}>
      <AdminPanel />
    </RouteGuard>
  );
}
```

Or use `withRouteGuard` HOC:

```tsx
import { withRouteGuard } from "@/components/auth";

function AdminPage() {
  return <AdminPanel />;
}

export default withRouteGuard(AdminPage, {
  allowedRoles: ["Administrator"]
});
```

### 3. Conditional Rendering

Use `useRBAC` hook for conditional rendering:

```tsx
import { useRBAC } from "@/hooks";

function MyComponent() {
  const { isAdmin, isTeamLeadOrHigher, hasRole, canAccess } = useRBAC();

  return (
    <div>
      {isAdmin && <AdminOnlyButton />}
      {isTeamLeadOrHigher && <TeamManagementLink />}
      {hasRole("Estimator") && <EstimatorTools />}
      {canAccess("/team") && <TeamLink />}
    </div>
  );
}
```

Use `usePermission` for simple checks:

```tsx
import { usePermission } from "@/hooks";

function EditButton() {
  const canEdit = usePermission(["Administrator", "Team Lead"]);

  if (!canEdit) return null;
  return <button>Edit</button>;
}
```

### 4. Navigation Items

Add nav items in `Navbar.tsx`:

```typescript
const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    // No allowedRoles = all authenticated users
  },
  {
    href: "/admin",
    label: "Admin Panel",
    icon: Shield,
    allowedRoles: ["Administrator"],  // Only admins see this
  },
];
```

## Adding a New Protected Route

### Step 1: Add Route Permission (Optional)

In `src/lib/auth/rbac.ts`:

```typescript
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // ... existing routes
  {
    path: '/new-route',
    allowedRoles: ['Administrator', 'Team Lead'],
    description: 'New protected route',
  },
];
```

### Step 2: Add API Route (if needed)

```typescript
// src/app/api/new-route/route.ts
import { withRoleAuth } from '@/lib/auth';

export const GET = withRoleAuth(
  ['Administrator', 'Team Lead'],
  async (request, { user }) => {
    // Your logic here
  }
);
```

### Step 3: Add Page

```tsx
// src/app/(protected)/new-route/page.tsx
"use client";

import { RouteGuard } from "@/components/auth";

export default function NewRoutePage() {
  return (
    <RouteGuard allowedRoles={["Administrator", "Team Lead"]}>
      <YourComponent />
    </RouteGuard>
  );
}
```

### Step 4: Add to Navigation (if needed)

In `src/components/layout/Navbar.tsx`:

```typescript
const NAV_ITEMS: NavItem[] = [
  // ... existing items
  {
    href: "/new-route",
    label: "New Route",
    icon: YourIcon,
    allowedRoles: ["Administrator", "Team Lead"],
  },
];
```

## Security Layers

1. **Middleware** (`src/middleware.ts`)
   - Runs at the edge
   - Checks for auth cookie
   - Redirects unauthenticated users to login

2. **API Route Wrappers** (`withAuth`, `withRoleAuth`)
   - Validates session
   - Checks role permissions
   - Returns 401/403 for unauthorized access

3. **RouteGuard Component**
   - Client-side protection
   - Shows loading/error states
   - Redirects or shows access denied

## Available Hooks

### useRBAC()

```typescript
const {
  userRole,           // Current user's role or null
  hasRole,            // (role) => boolean
  hasAnyRole,         // (roles[]) => boolean
  hasMinRole,         // (minRole) => boolean
  canAccess,          // (path) => boolean
  isAdmin,            // boolean
  isTeamLead,         // boolean
  isEstimator,        // boolean
  isTeamLeadOrHigher, // boolean
  canManageTeam,      // boolean
  canInviteUsers,     // boolean
} = useRBAC();
```

### usePermission(roles)

```typescript
const canEdit = usePermission(['Administrator', 'Team Lead']);
```

### useMinRole(role)

```typescript
const canAccess = useMinRole('Team Lead');
```

## Best Practices

1. **Always use withRoleAuth for sensitive API routes**
2. **Always wrap protected pages with RouteGuard**
3. **Keep permissions in sync** between Navbar, RBAC config, and pages
4. **Use the most restrictive permission that makes sense**
5. **Test with different user roles**
